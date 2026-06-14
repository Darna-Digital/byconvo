import { ExampleDependencies } from "../entity/example.interfaces";
import { createExampleFunctions } from "../functions/example.functions";

export async function exampleRscAdapter() {
    const dependencies: ExampleDependencies = {
        data: {
            example: "example",
        },
        sideEffects: {
            example: () => console.log("example side effect"),
        },
    };

    const callInvoker = () => {
        const functions = createExampleFunctions(dependencies);

        functions.invoker();
    };

    return {
        callInvoker,
    };
}
