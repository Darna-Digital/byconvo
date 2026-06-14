export interface ExampleDependencies {
    data: {
        example: string;
    };
    sideEffects: {
        example: () => void;
    };
}

export interface ExampleFunctions {
    invoker: () => void;
}
