import { z, ZodType } from "zod"
import type { Socket, RemoteSocket } from "socket.io"
import type { Socket as CSocket } from "socket.io-client"
import type { DefaultEventsMap } from "socket.io/dist/typed-events"
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
export const newSend = (socket: Socket | RemoteSocket<DefaultEventsMap, any> | CSocket, timeout = 3000) => socket["sendMsg"] = async (data: z.infer<typeof allType>) =>
    socket.timeout(timeout).emit("msg", await allType.parseAsync(data))

export const newHook = <I extends ZodType, O extends ZodType>(u: {
    io: (z: typeof import("zod").z) => {
        input: I,
        output: O
    }
    func: (input: z.infer<I>) => Promise<z.infer<O> | void> | z.infer<O> | void
}) => u

export const condition = (socket: RemoteSocket<DefaultEventsMap, any>, target: string[]) => target.length > 0 ? (target.includes(socket.id) && socket["type"] === "pod") : socket["type"] === "pod"
