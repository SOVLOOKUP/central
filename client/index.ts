import { newSend, parseZodObjectFunc } from "../utils";
import { nanoid } from "nanoid";
import { io } from "socket.io-client";
import { Multicast } from "queueable";
import { z } from "zod";
import { allType, ClientHook, returnType } from "../type"
import { batchWithTimeout, collect, concat, filter, take, transform } from "streaming-iterables";

export default function Connect({ uri, token }: { uri: string, token: string }) {
    const msgChannel = new Multicast<z.infer<typeof allType>>()
    const socket = io(uri, { auth: { type: "client", token: token } });
    const send = newSend(socket)

    const pods = async (msg_id = nanoid()) => {
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        await send({
            id: msg_id,
            type: "call",
            data: { func: "__pods__" }
        })
        return (await subscription.next()).value.data.output as string[]
    }

    const meta = async (msg_id = nanoid()) => {
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        const sockets = await pods()
        if (sockets.length === 0) {
            return concat([])
        }
        await send({
            id: msg_id,
            type: "call",
            data: { func: "__meta__" }
        })
        return transform(sockets.length, async (msg) => ({
            ...(msg as any).data.output.msg.data.output,
            hooks: await parseZodObjectFunc((msg as any).data.output.msg.data.output.hooks)
        }), take(sockets.length, subscription))
    }

    socket.on("msg", async (data) => msgChannel.push(await allType.parseAsync(data)))
    return { meta, pods }
}