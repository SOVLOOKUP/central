
import { Channel } from "queueable"
import { z } from "zod"
import { Hooks, newHook, newSend, WS } from "../utils";
import { allType, RawHook } from "../type"
import { nanoid } from "nanoid";
import { decode } from "@xobj/core";
import { isArrayBuffer } from "util/types";

export { newHook }
export default function Connect(uri: string, hooks: Hooks = {}) {
    const socket = new WS(uri);
    socket.binaryType = "arraybuffer";
    const rc = new Channel<z.infer<typeof allType>>()
    const meta = new Map(Object.entries(hooks))
    const send = newSend(socket)

    socket.onmessage = async function (e) {
        if (!isArrayBuffer(e.data)) {
            console.log("协议错误")
            socket.close()
        } else {
            try {
                const msg = decode(e.data)
                if (msg.type === "call" && msg.data.func === "meta") {
                    // 相应 meta 调用
                    const output: RawHook = {
                        id: socket["id"],
                        hooks: {}
                    }
                    for (const [key, value] of meta) {
                        output.hooks[key] = value.io.toString()
                    }
                    await send({
                        id: msg.id,
                        type: "return",
                        data: {
                            func: msg.data.func,
                            status: "success",
                            output
                        }
                    })
                } else {
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
                                    console.log("函数运行错误")
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
                        // todo 处理 return
                        await rc.push(msg)
                    }
                }
            } catch (error) {
                console.log("数据解析错误")
                socket.close()
            }
        }
    }

    return new Promise<ReturnType<typeof rc["wrap"]>>((resolve, reject) => {
        socket.onopen = async () => {
            // 生成自己的身份证
            const id = nanoid()
            // 记录身份证
            socket["id"] = id
            // 发送身份证
            await send({
                id,
                type: "call",
                data: { func: "initClient" }
            })
            resolve(rc.wrap())
        }
    })
}
