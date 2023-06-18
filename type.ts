import { Socket } from "socket.io"
import { ZodType } from "zod"
import { z } from "zod"

export interface CentralSocket extends Socket {
    type: "pod" | "client"
}

// RPC 函数的出入参
export interface IO {
    input: ZodType,
    output: ZodType
}

export interface ClientHook {
    id: string,
    hooks: { [key: string]: IO }
}

const baseType = z.object({
    // 数据包 ID
    id: z.string().length(21),
})

// 调用类型
export const callType = baseType.extend({
    type: z.enum(["call"]),
    data: z.object({
        func: z.string(),
        input: z.any()
    })
})

// 返回类型
export const returnType = baseType.extend({
    type: z.enum(["return"]),
    data: z.object(
        {
            func: z.string(),
            status: z.enum(["success"]),
            output: z.any()
        }
    ).or(z.object(
        {
            func: z.string(),
            status: z.enum(["error"]),
            error: z.object({
                name: z.string(),
                message: z.string().optional(),
                stack: z.string().optional()
            })
        }
    ))
})

export const allType = z.union([callType, returnType])
