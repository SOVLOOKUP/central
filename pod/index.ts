
import { Channel } from "queueable"
import { z } from "zod"
import { io } from "socket.io-client";
import { newHook, newSend } from "../utils";
import { allType, jsonSchema, PodConfig } from "../type"
export { newHook }

export default function Connect(opt: PodConfig) {
    const socket = io(opt.url, { auth: { type: "pod", token: "" } });
    const hooks = opt.hooks ?? {}
    const info = opt.info ?? (() => { })
    socket.compress(true)
    socket["info"] = info
    const msgChannel = new Channel<z.infer<typeof allType>>()
    const meta = new Map(Object.entries(hooks))
    const send = newSend(socket)

    meta.set("__meta__", newHook({
        io: (z) => {
            return {
                input: z.void(),
                output: z.object({
                    info: jsonSchema,
                    hooks: z.record(z.string(), z.string())
                })
            };
        },
        func: async () => {
            const output = {
                info: await socket["info"]() ?? null,
                hooks: {}
            }
            for (const [key, value] of meta) {
                // 去掉隐藏函数
                if (!(key.endsWith("__") && key.startsWith("__"))) {
                    output.hooks[key] = value.io.toString()
                }
            }
            return output
        }
    }))

    socket.on("msg", async (data) => {
        const msg = await allType.parseAsync(data)
        if (msg.type === "call") {
            const hook = meta.get(msg.data.func)
            if (hook) {
                const { input, output } = hook.io(z)
                // 校验输入
                const parsedInput = await input.safeParseAsync(msg.data.input)
                if (parsedInput.success) {
                    // 运行 func 并校验输出
                    try {
                        const data = await hook.func(parsedInput.data)
                        const outdata = await output.safeParseAsync(data)
                        if (outdata.success) {
                            await send({
                                id: msg.id,
                                type: "return",
                                data: {
                                    func: msg.data.func,
                                    status: "success",
                                    output: outdata.data
                                }
                            })
                        } else {
                            // 输出校验失败
                            console.log("输出校验失败")
                        }
                    } catch (error) {
                        // 函数运行错误
                        console.log("函数运行错误", error)
                    }
                } else {
                    // 校验失败 输入校验失败
                    console.log("输入校验失败")
                }
            } else {
                // 404 未找到 called func
                console.log("未找到 called func")
            }
        } else if (msg.type === "return") {
            // 处理 return
            await msgChannel.push(msg)
        }
    })

    return msgChannel.wrap()
}
