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

    const call = async <T>(name: string, input?: I, target: string[] = [], msg_id = nanoid()) => {
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        const sockets = await pods()

        // todo 先接受一个答案的长度值
        if (sockets.length === 0) {
            return concat([]) as unknown as AsyncIterableIterator<T>
        }

        await send({
            id: msg_id,
            type: "call",
            data: { func: name, input, target }
        })
        return take(sockets.length, subscription)
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
    const meta = async (msg_id = nanoid()): Promise<AsyncIterableIterator<ClientHook>> => {
        // 订阅本 id 的信息流
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        await send({
            id: msg_id,
            type: "call",
            data: { func: "__meta__" }
        })
        // 获取第一个消息
        const first_msg = (await collect(take(1, subscription)))[0]
        if (first_msg.type === "return" && first_msg.data.status === "success") {
            // 获取返回的长度
            const len: number = first_msg.data.output["sockets"].length
            if (len === 0) {
                // 没有就返回空
                return concat([]) as unknown as AsyncIterableIterator<ClientHook>
            } else {
                // 返回数据
                return transform(len, async (msg) => {
                    return ({
                        ...(msg as any).data.output.msg.data.output,
                        id: (msg as any).data.output.msg.socketId,
                        hooks: await parseZodObjectFunc((msg as any).data.output.msg.data.output.hooks)
                    })
                }, take(len, concat([first_msg], subscription)))
            }
        } else {
            console.log(JSON.stringify(first_msg))
            throw new Error("数据错误",)
        }
    }

    socket.on("msg", async (data) => msgChannel.push(await allType.parseAsync(data)))
    return { meta, pods, call }
}