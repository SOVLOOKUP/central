import type { Server } from "socket.io"
import { newSend } from '../utils';
import { nanoid } from "nanoid"
import { filter, take } from "streaming-iterables"
import { Multicast } from 'queueable';
import { allType } from '../type';
import { z } from 'zod';
import TM from "./tokenManager"

export default function serve(wss: Server) {
    wss.compress(true)
    const msgChannel = new Multicast<z.infer<typeof allType>>()
    const tm = TM()
    // 广播消息并获得回复
    const broadcast = async (msg: z.infer<typeof allType>) => {
        const sockets: string[] = []
        for (const socket of await wss.fetchSockets()) {
            if (socket["type"] === "pod") {
                sockets.push(socket.id)
                const send = newSend(socket)
                await send(msg)
            }
        }
        return { sockets, msgIter: take(sockets.length, filter((v) => v.id === msg.id, msgChannel[Symbol.asyncIterator]())) }
    }

    // 处理 client 信息
    const porcessClientMsg = async (msg: z.infer<typeof allType>, send: ReturnType<typeof newSend>) => {
        if (msg.type === "call") {
            if (msg.data.func === "__meta__") {
                // 广播消息
                const { sockets, msgIter } = await broadcast(msg)
                for await (const msg of msgIter) {
                    await send({
                        id: msg.id,
                        type: "return",
                        data: {
                            status: "success",
                            func: msg.data.func,
                            output: { sockets, msg }
                        }
                    })
                }
            }
        }
    }

    // 认证连接
    wss.use(async (socket, next) => {
        const res = await tm.valid(socket.handshake.auth)
        if (res === false) {
            next(new Error("not authorized"))
        } else {
            socket["type"] = res
            console.log(socket.id, res, "已连接")
            next()
        }
    });

    wss.on('connection', async (socket) => {
        const send = newSend(socket)
        socket.on("disconnect", (reason) => console.log(socket["id"], (socket["type"] === "client" ? "客户端" : "Pod") + "已关闭:", reason));
        socket.use(async ([event, data], next) => {
            if (event === "msg") {
                const result = await allType.safeParseAsync(data)
                if (result.success === true) {
                    const msg = result.data
                    switch (socket["type"]) {
                        case "client":
                            await porcessClientMsg(msg, send)
                            break;

                        case "pod":
                            msgChannel.push(msg)
                            break;

                        default:
                            console.log("未知 socket 类型:", socket["type"])
                            socket.disconnect()
                    }
                } else {
                    next(result.error)
                }
            }
        })
    })
}
