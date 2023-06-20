import { newSend, parseZodObjectFunc } from "../utils";
import { nanoid } from "nanoid";
import { io } from "socket.io-client";
import { Multicast } from "queueable";
import { z } from "zod";
import { allType } from "../type"
import { concat, filter, take, transform } from "streaming-iterables";
import type { CallOptions, ClientHook } from "./type";
export type { BCMsg } from "./type"

export default function Connect({ uri, token }: { uri: string, token: string }) {
    const msgChannel = new Multicast<z.infer<typeof allType>>()
    const socket = io(uri, { auth: { type: "client", token: token } });
    const send = newSend(socket)

    // 类型和出入参规范化
    const call = async <T>(opts: CallOptions<T>) => {
        opts.msgId ??= nanoid()
        opts.parser ??= msg => msg as T
        const { name, msgId, input, target, parser } = opts
        // 订阅本 id 的信息流
        const subscription = filter((v) => v.id === msgId, msgChannel[Symbol.asyncIterator]())
        await send({
            id: msgId,
            type: "call",
            data: { func: name, input, target }
        })
        // 获取第一个消息
        const first_msg = (await subscription.next()).value
        if (first_msg.type === "return" && first_msg.data.status === "success") {
            // 获取返回的长度
            const len: number = first_msg.data.output["sockets"].length
            if (len === 0) {
                // 没有就返回空
                return concat([]) as unknown as AsyncIterableIterator<T>
            } else {
                // 返回数据
                return transform(len, async (msg) => {
                    const allSockets = msg.data.output.sockets
                    const currentSocket = msg.data.output.msg.socketId
                    const data = msg.data.output.msg.data.output
                    return await parser({ allSockets, currentSocket, data })
                }, take(len, concat([first_msg], subscription)))
            }
        } else {
            console.log(JSON.stringify(first_msg))
            throw new Error("数据错误",)
        }
    }

    // 获取所有 pod 的 id
    const pods = async (msg_id = nanoid()) => {
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        await send({
            id: msg_id,
            type: "call",
            data: { func: "__pods__" }
        })
        return (await subscription.next()).value.data.output as string[]
    }

    // 获取所有 pod 的可调用函数元信息
    const meta = () => call<ClientHook>({
        name: "__meta__",
        parser: async (msg) => ({
            ...msg,
            data: {
                ...(msg.data as object),
                hooks: await parseZodObjectFunc(msg.data["hooks"])
            }
        } as unknown as ClientHook),
    })

    socket.on("msg", async (data) => msgChannel.push(await allType.parseAsync(data)))
    return { meta, pods, call }
}