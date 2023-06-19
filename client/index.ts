import { newSend, parseZodObjectFunc } from "../utils";
import { nanoid } from "nanoid";
import { io } from "socket.io-client";
import { Multicast } from "queueable";
import { z } from "zod";
import { allType, I } from "../type"
import { collect, concat, filter, take, transform } from "streaming-iterables";
import type { ClientHook } from "./type";

export default function Connect({ uri, token }: { uri: string, token: string }) {
    const msgChannel = new Multicast<z.infer<typeof allType>>()
    const socket = io(uri, { auth: { type: "client", token: token } });
    const send = newSend(socket)

    // todo 类型和出入参规范化
    const call = async <T>(name: string, input?: I, target: string[] = [], parser = async (msg) => Promise<T>, msg_id = nanoid()) => {
        // 订阅本 id 的信息流
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        await send({
            id: msg_id,
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
                return concat([]) as unknown as AsyncIterableIterator<ClientHook>
            } else {
                // 返回数据
                return transform(len, parser, take(len, concat([first_msg], subscription)))
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
    const meta = () => call<ClientHook>("__meta__", undefined, [], async (msg) => {
        return ({
            ...(msg as any).data.output.msg.data.output,
            id: (msg as any).data.output.msg.socketId,
            hooks: await parseZodObjectFunc((msg as any).data.output.msg.data.output.hooks)
        })
    })

    socket.on("msg", async (data) => msgChannel.push(await allType.parseAsync(data)))
    return { meta, pods, call }
}