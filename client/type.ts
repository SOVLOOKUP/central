import { ZodType } from "zod"

export interface ClientHook {
    id: string
    info: JSON
    hooks: {
        [key: string]: ZodType
    }
}