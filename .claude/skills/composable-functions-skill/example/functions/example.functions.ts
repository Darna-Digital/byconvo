import { ExampleDependencies, ExampleFunctions } from "../entity/example.interfaces";

export function createExampleFunctions(d: ExampleDependencies) {
    function invoker() {
        d.sideEffects.example();
    }

    return {
        invoker,
    } satisfies ExampleFunctions;
}
