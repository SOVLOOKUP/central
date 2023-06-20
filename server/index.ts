import { Server, ServerOptions } from "socket.io"
import { condition, newSend } from '../utils';
import { filter, take } from "streaming-iterables"
import { Multicast } from 'queueable';
import { allType } from '../type';
import { z } from 'zod';
import TM from "./tokenManager"
import * as parser from "socket.io-msgpack-parser"

interface ServeOptions extends Partial<ServerOptions> {
    token: string[]
}

export default function serve(opts: ServeOptions) {
    opts.parser = parser
    const wss = new Server(opts)
    wss.compress(true)
    const msgChannel = new Multicast<z.infer<typeof allType>>()
    const tm = TM(opts.token)

    // 广播消息并获得回复
    const broadcast = async (msg: z.infer<typeof allType>, ...target: string[]) => {
        const sockets: string[] = []
        for (const socket of await wss.fetchSockets()) {
            // 指定 target 则定向广播
            if (condition(socket, target)) {
                sockets.push(socket.id)
                await newSend(socket)(msg)
            }
        }
        return { sockets, msgIter: take(sockets.length, filter((v) => v.id === msg.id, msgChannel[Symbol.asyncIterator]())) }
    }

    // 处理 client 信息
    const porcessClientMsg = async (msg: z.infer<typeof allType>, send: ReturnType<typeof newSend>) => {
        if (msg.type === "call") {
            // server 自己的调用
            if (msg.data.func === "__pods__") {
                // 获取所有的 pod
                await send({
                    id: msg.id,
                    type: "return",
                    data: {
                        status: "success",
                        func: msg.data.func,
                        output: (await wss.fetchSockets()).filter(i => i["type"] === "pod").map(i => i.id)
                    }
                })
            } else {
                // 广播消息
                const { sockets, msgIter } = await broadcast(msg, ...msg.data.target)
                if (sockets.length === 0) {
                    await send({
                        id: msg.id,
                        type: "return",
                        data: {
                            status: "success",
                            func: msg.data.func,
                            output: { sockets }
                        }
                    })
                } else {
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
    return wss
}
