import { Server } from 'socket.io';
import { pod, server, client, newHook } from './index';

const port = 3001
const domain = "localhost"
const token = ["token"]

// server
server(new Server(port), { token })

pod({
    url: `ws://${domain}:${port}`, hooks: {
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
    }
})

// client
const sdk = client({ uri: `ws://${domain}:${port}`, token: token[0] })
const meta = await sdk.meta()

for await (const hook of meta) {
    console.log(hook)
}

console.log("end");
