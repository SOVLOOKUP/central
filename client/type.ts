import { I, Json } from "../type"
import { ZodType } from "zod"

export interface BCMsg {
    allSockets: string[],
    currentSocket: string,
    data?: Json
}

export interface CallOptions<T> {
    name: string // 函数名称
    input?: I, // 输入
    target?: string[] // 目标 pod
    parser?: (msg: BCMsg) => Promise<T> | T // 消息解析函数
    msgId?: string // 会话 id, 一般不需要指定
}

export interface ClientHook extends Omit<BCMsg, "data"> {
    data: {
        info: Json,
        hooks: {
            [key: string]: { input: ZodType, output: ZodType }
        }
    }
}