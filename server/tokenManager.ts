import { z } from "zod"

const token = ["token"]

const AuthMsg = z.object({
    type: z.enum(["client", "pod"]),
    token: z.string()
})

export default () => {
    return {
        valid: async (msg: unknown) => {
            const data = await AuthMsg.safeParseAsync(msg)
            if (data.success) {
                switch (data.data.type) {
                    case "client":
                        return token.includes(data.data.token) ? "client" : false
                    case "pod":
                        return "pod"
                }
            } else return false
        }
    }
}