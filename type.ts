import type { Socket } from "socket.io"
import { z } from "zod"
import { newHook } from "./utils";

// JSON 
const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];
export const jsonSchema: z.ZodSchema<Json> = z.lazy(() =>
    z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);
// 拓展后的 Socket 类型
export interface CentralSocket extends Socket {
    type: "pod" | "client"
    info?: () => Promise<Json> | Json
}
// IO: RPC 函数的出入参
const I = z.union([jsonSchema, z.void()])
export type I = z.infer<typeof I>
const O = z.union([jsonSchema, z.void()])
export type O = z.infer<typeof O>
const IO = z.object({ input: I, output: O })
export type IO = z.infer<typeof IO>
// Pod 的初始化参数
export type Hook = ReturnType<typeof newHook>
interface Hooks {
    [key: string]: Hook
}
export interface PodConfig {
    url: string
    info?: () => Json | Promise<Json>
    hooks?: Hooks
}
// 连接服务器的认证参数
export const AuthMsg = z.object({
    type: z.enum(["client", "pod"]),
    token: z.string()
})
// 数据包基础类型
const baseType = z.object({
    // 数据包 ID
    id: z.string().length(21),
    socketId: z.string().length(20).optional(),
})
// 调用类型
const callType = baseType.extend({
    type: z.enum(["call"]),
    data: z.object({
        target: z.array(z.string()).default([]),
        func: z.string(),
        input: I
    })
})
// 返回类型
const returnType = baseType.extend({
    type: z.enum(["return"]),
    data: z.union([z.object(
        {
            func: z.string(),
            status: z.enum(["success"]),
            output: O
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
// 所有类型
export const allType = z.union([callType, returnType])
