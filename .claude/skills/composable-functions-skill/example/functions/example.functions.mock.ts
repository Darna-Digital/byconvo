import { ExampleDependencies } from "../entity/example.interfaces";

export const createExampleDependenciesMock = (): ExampleDependencies => {
    return {
        data: {
            example: "",
        },
        sideEffects: { example: jest.fn() },
    };
};
