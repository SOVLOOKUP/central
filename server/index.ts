import type { WebSocketServer } from 'ws';
import { newSend } from '../utils';
import { nanoid } from "nanoid"
import { filter, take } from "streaming-iterables"
import { Multicast } from 'queueable';
import { allType } from '../type';
import { z } from 'zod';
import { decode } from '@xobj/core';
import { isArrayBuffer } from 'util/types';

export default function serve(wss: WebSocketServer, token: string) {
    const msgChannel = new Multicast<z.infer<typeof allType>>()

    // 有客户端连接时
    wss.on('connection', async (socket) => {
        socket.binaryType = "arraybuffer";
        const send = newSend(socket)

        socket.once("message", async (data) => {
            if (!isArrayBuffer(data)) {
                console.log("协议错误")
                socket.close()
            } else {
                // 处理消息包解析错误
                try {
                    const msg: z.infer<typeof allType> = decode(data)
                    // 记录身份证
                    socket["id"] = msg.id
                    if (msg.type === "call" && msg.data.func === "initClient") {
                        // 判断为客户端接入
                        socket["type"] = "client"
                        console.log(socket["id"], "客户端已连接")
                        // 处理消息
                        socket.onmessage = async (e) => {
                            const msg: z.infer<typeof allType> = decode(e.data as ArrayBuffer)
                            msgChannel.push(msg)
                        };
                    } else if (msg.type === "call" && msg.data.func === "initSDK") {
                        // 判断为 SDK 接入
                        if (msg.data.input !== token) {
                            // 密钥不正确
                            await send({
                                id: msg.id,
                                type: "return",
                                data: {
                                    status: "error",
                                    func: msg.data.func,
                                    error: {
                                        name: "密钥错误",
                                        message: "没有密钥:" + msg.data.input
                                    }
                                }
                            })
                            socket.close()
                        } else {
                            socket["type"] = "sdk"
                            console.log(socket["id"], "SDK 已连接")
                            socket.onmessage = async (e) => {
                                const msg: z.infer<typeof allType> = decode(e.data as ArrayBuffer)
                                await porcessClientMsg(msg, send)
                            };
                        }
                    } else {
                        console.log("协议没有初始化", msg)
                        socket.close()
                    }
                } catch (error) {
                    console.log("数据解析错误")
                    socket.close()
                }
            }
        })

        socket.onclose = () => {
            console.log(socket["id"], (socket["type"] === "client" ? "客户端" : "SDK") + "已关闭");
        };
        socket.onerror = function (e) {
            console.log("出现错误");
        };
    })

    // 获取所有 Pod 的 meta
    const getHooks = async (msg_id = nanoid()) => {
        const sockets: string[] = []
        for (const socket of wss.clients.values()) {
            if (socket["type"] === "client") {
                sockets.push(socket["id"])
                const send = newSend(socket)
                await send({
                    id: msg_id,
                    type: "call",
                    data: { func: "meta" }
                })
            }
        }
        return { sockets, hooksIter: take(sockets.length, filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())) }
    }

    // 处理 client 信息
    const porcessClientMsg = async (msg: z.infer<typeof allType>, send: ReturnType<typeof newSend>) => {
        if (msg.type === "call") {
            if (msg.data.func === "hooks") {
                // 收集并发送所有 meta
                const { sockets, hooksIter } = await getHooks(msg.id)
                for await (const hook of hooksIter) {
                    await send({
                        id: msg.id,
                        type: "return",
                        data: {
                            status: "success",
                            func: msg.data.func,
                            output: { sockets, hook }
                        }
                    })
                }
            }
        }
    }

    return new Promise<void>((resolve, reject) => {
        wss.on("listening", resolve)
        wss.on("error", (_: WebSocketServer, err: Error) => reject(err))
    })
}
