import { z, ZodType } from "zod"
import type { WebSocket as NJWS } from 'ws';
import { encode } from "@xobj/core";
import { allType, IO } from "./type";

// 解析 zod 函数为 IO type
export const parseZodFunc = (zodFunc: string): Promise<IO> => (new (Object.getPrototypeOf(async function () { }).constructor)("z", `return await (${zodFunc})(z)`))(z)

export const parseZodObjectFunc = async (obj: { [key: string]: string }) => {
    const nobj: { [key: string]: IO } = {}
    for (const [key, value] of Object.entries(obj)) {
        nobj[key] = await parseZodFunc(value)
    }
    return nobj
}

// 构造数据发送器
export const newSend = (socket: WebSocket | NJWS) => (data: z.infer<typeof allType>) => (typeof window === 'undefined') ?
    new Promise<void>(async (ok, rj) =>
        // nodejs
        (socket as NJWS).send(encode(await allType.parseAsync(data)), (err) => {
            if (!err) {
                ok()
            } else {
                rj(err)
            }
        })
    ) : new Promise<void>(async (ok, rj) => {
        // browser
        try {
            (socket as WebSocket).send(encode(await allType.parseAsync(data)))
            ok()
        } catch (error) {
            rj(error)
        }
    })

export const WS = (typeof window === 'undefined') ? (await import("ws")).WebSocket : WebSocket

// 构造数据接收器
// export const receive = (e: MessageEvent) => {
//     if (!(e.data as ArrayBuffer).byteLength) {
//         console.log(JSON.parse(e.data))
//         // throw new Error("wrong type of message")
//     } else {

//         const msg = decode(e.data as ArrayBuffer)
//         return msg
//     }
// }

export interface Hooks {
    [key: string]: ReturnType<typeof newHook>
}

export const newHook = <I extends ZodType, O extends ZodType>(u: {
    io: (z: typeof import("zod").z) => {
        input: I,
        output: O
    }
    func: (input: z.infer<I>) => Promise<z.infer<O> | void> | z.infer<O> | void
}) => u
