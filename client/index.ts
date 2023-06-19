import { newSend, parseZodObjectFunc } from "../utils";
import { nanoid } from "nanoid";
import { io } from "socket.io-client";
import { Multicast } from "queueable";
import { z } from "zod";
import { allType, I } from "../type"
import { concat, filter, take, transform } from "streaming-iterables";
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
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        const sockets = await pods()
        if (sockets.length === 0) {
            return concat([]) as unknown as AsyncIterableIterator<ClientHook>
        }
        await send({
            id: msg_id,
            type: "call",
            data: { func: "__meta__" }
        })
        return transform(sockets.length, async (msg) => {
            console.log((msg as any).data.output)
            return ({
                ...(msg as any).data.output.msg.data.output,
                id: (msg as any).data.output.msg.socketId,
                hooks: await parseZodObjectFunc((msg as any).data.output.msg.data.output.hooks)
            })
        }, take(sockets.length, subscription))
    }

    socket.on("msg", async (data) => msgChannel.push(await allType.parseAsync(data)))
    return { meta, pods, call }
}