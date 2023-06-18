import { newSend, parseZodObjectFunc, WS } from "../utils";
import { nanoid } from "nanoid";
import { decode } from "@xobj/core";
import { Multicast } from "queueable";
import { z } from "zod";
import { allType, ClientHook } from "../type"
import { filter } from "streaming-iterables";
import { take } from "streaming-iterables";

export default function Connect({ uri, token }: { uri: string, token: string }) {
    const msgChannel = new Multicast<z.infer<typeof allType>>()
    const socket = new WS(uri);
    socket.binaryType = "arraybuffer";
    const send = newSend(socket)

    const getHooks = async (msg_id = nanoid()) => {
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        await send({
            id: msg_id,
            type: "call",
            data: { func: "hooks" }
        })
        const first = await subscription.next()
        const len = first.value.data.output.sockets.length

        return {
            clients: first.value.data.output.sockets as string[],
            hooks: {
                [Symbol.asyncIterator]: async function* (): AsyncGenerator<ClientHook> {
                    yield {
                        ...first.value.data.output.hook.data.output,
                        hooks: await parseZodObjectFunc(first.value.data.output.hook.data.output.hooks)
                    }
                    for await (const hook of take(len - 1, subscription)) {
                        yield {
                            ...(hook as any).data.output.hook.data.output,
                            hooks: await parseZodObjectFunc((hook as any).data.output.hook.data.output.hooks)
                        }
                    }
                }
            }
        }
    }

    socket.onmessage = (d) => {
        const msg = decode(d.data as ArrayBuffer)
        msgChannel.push(msg)
    }

    const result = { getHooks }

    return new Promise<typeof result>((resolve, reject) => {
        socket.onopen = async () => {
            socket["id"] = nanoid()
            // 认证客户端
            await send({
                id: socket["id"],
                type: "call",
                data: { func: "initClient", input: token }
            })
            resolve(result)
        }
    })
}