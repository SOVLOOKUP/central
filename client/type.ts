import { I, Json } from "../type"
import { ZodType } from "zod"

export interface BCMsg {
    allSockets: string[],
    currentSocket: string,
    data?: Json
}

export interface CallOptions<T> {
    name: string
    input?: I,
    target?: string[]
    parser?: (msg: BCMsg) => Promise<T> | T
    msgId?: string
}

export interface ClientHook extends Omit<BCMsg, "data"> {
    data: {
        info: Json,
        hooks: {
            [key: string]: { input: ZodType, output: ZodType }
        }
    }
}