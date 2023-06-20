import { AuthMsg } from "../type"

export default (token: string[]) => {
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