import { newSend, parseZodObjectFunc } from "../utils";
import { nanoid } from "nanoid";
import { io } from "socket.io-client";
import { Multicast } from "queueable";
import { z } from "zod";
import { allType, ClientHook } from "../type"
import { filter, take } from "streaming-iterables";

export default function Connect({ uri, token }: { uri: string, token: string }) {
    const msgChannel = new Multicast<z.infer<typeof allType>>()
    const socket = io(uri, { auth: { type: "client", token: token } });
    const send = newSend(socket)
    const getHooks = async (msg_id = nanoid()) => {
        const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())
        await send({
            id: msg_id,
            type: "call",
            data: { func: "__meta__" }
        })
        const first = await subscription.next()
        const len: number = first.value.data.output.sockets.length

        return {
            clients: first.value.data.output.sockets as string[],
            msgIter: {
                [Symbol.asyncIterator]: async function* (): AsyncGenerator<ClientHook> {
                    yield {
                        ...first.value.data.output.msg.data.output,
                        hooks: await parseZodObjectFunc(first.value.data.output.msg.data.output.hooks)
                    }
                    for await (const hook of take(len - 1, subscription)) {
                        yield {
                            ...(hook as any).data.output.msg.data.output,
                            hooks: await parseZodObjectFunc((hook as any).data.output.msg.data.output.hooks)
                        }
                    }
                }
            }
        }
    }

    socket.on("msg", async (data) => msgChannel.push(await allType.parseAsync(data)))
    return { getHooks }
}