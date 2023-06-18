import { Server } from 'socket.io';
import { pod, server, client, newHook } from './index';

const port = 3001
const domain = "localhost"
const token = "token"

// server
server(new Server(port))

pod(`ws://${domain}:${port}`, {
    add: newHook({
        io: (z) => ({
            input: z.number(),
            output: z.number()
        }),
        func: (x) => x + 1
    }),
    plus: newHook({
        io: (z) => ({
            input: z.number(),
            output: z.number()
        }),
        func: (x) => x + 1
    })
})
pod(`ws://${domain}:${port}`, {
    add: newHook({
        io: (z) => ({
            input: z.number(),
            output: z.number()
        }),
        func: (x) => x + 1
    }),
    plus: newHook({
        io: (z) => ({
            input: z.number(),
            output: z.number()
        }),
        func: (x) => x + 1
    })
})

// client
const sdk = client({ uri: `ws://${domain}:${port}`, token })
const hooks = await sdk.getHooks()

for await (const hook of hooks.msgIter) {
    console.log(hook)
}
