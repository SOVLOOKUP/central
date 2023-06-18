import * as zod from 'zod';
import { ZodType, z } from 'zod';
import * as queueable from 'queueable';
import { Server } from 'socket.io';

interface IO {
    input: ZodType;
    output: ZodType;
}
interface ClientHook {
    id: string;
    hooks: {
        [key: string]: IO;
    };
}

declare function Connect$1({ uri, token }: {
    uri: string;
    token: string;
}): {
    getHooks: (msg_id?: string) => Promise<{
        clients: string[];
        hooks: {
            [Symbol.asyncIterator]: () => AsyncGenerator<ClientHook>;
        };
    }>;
};

interface Hooks {
    [key: string]: ReturnType<typeof newHook>;
}
declare const newHook: <I extends z.ZodType<any, z.ZodTypeDef, any>, O extends z.ZodType<any, z.ZodTypeDef, any>>(u: {
    io: (z: typeof zod.z) => {
        input: I;
        output: O;
    };
    func: (input: z.TypeOf<I>) => void | z.TypeOf<O> | Promise<void | z.TypeOf<O>>;
}) => {
    io: (z: typeof zod.z) => {
        input: I;
        output: O;
    };
    func: (input: z.TypeOf<I>) => void | z.TypeOf<O> | Promise<void | z.TypeOf<O>>;
};

declare function Connect(uri: string, hooks?: Hooks): queueable.WrappedBalancer<{
    id?: string;
    type?: "call";
    data?: {
        func?: string;
        input?: any;
    };
} | {
    id?: string;
    type?: "return";
    data?: {
        func?: string;
        status?: "success";
        output?: any;
    } | {
        func?: string;
        status?: "error";
        error?: {
            name?: string;
            message?: string;
            stack?: string;
        };
    };
}>;

declare function serve(wss: Server): void;

export { Connect$1 as client, newHook, Connect as pod, serve as server };
