import { Socket } from "socket.io"
import { ZodType } from "zod"
import { z } from "zod"
import { Hooks } from "./utils"

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];
export const jsonSchema: z.ZodSchema<Json> = z.lazy(() =>
    z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);

export interface CentralSocket extends Socket {
    type: "pod" | "client"
    info: () => Promise<Json> | Json
}

export interface PodConfig {
    url: string
    info?: () => Json | Promise<Json>
    hooks?: Hooks
}

// RPC 函数的出入参
export interface IO {
    input: ZodType,
    output: ZodType
}

export interface ClientHook {
    id: string,
    info: Json,
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
        target: z.array(z.string()).default([]),
        func: z.string(),
        input: jsonSchema.optional()
    })
})

// 返回类型
export const returnType = baseType.extend({
    type: z.enum(["return"]),
    data: z.union([z.object(
        {
            func: z.string(),
            status: z.enum(["success"]),
            output: jsonSchema.optional()
        }
    ), z.object(
        {
            func: z.string(),
            status: z.enum(["error"]),
            error: z.object({
                name: z.string(),
                message: z.string().optional(),
                stack: z.string().optional()
            })
        }
    )])
})

export const allType = z.union([callType, returnType])
