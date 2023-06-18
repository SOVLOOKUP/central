import { WebSocketServer } from 'ws';
import Server from './server';
import Pod, { newHook } from "./pod";
import Client from "./client"

const port = 3001
const domain = "localhost"
const token = "token"

// server
await Server(new WebSocketServer({ port: port, }), token)

// pod
for await (const v of await Pod(`ws://${domain}:${port}`, {
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
})) {
    console.log(v);
}

// client
const sdk = await Client({ uri: `ws://${domain}:${port}`, token })
const hooks = await sdk.getHooks()

for await (const hook of hooks.hooks) {
    console.log(hook)
}