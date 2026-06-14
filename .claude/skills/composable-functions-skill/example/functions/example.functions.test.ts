import { createExampleFunctions } from "./example.functions";
import { createExampleDependenciesMock } from "./example.functions.mock";

describe("Example functions", () => {
    describe("invoker", () => {
        it("should trigger side effect", () => {
            const dependencies = createExampleDependenciesMock();
            const functions = createExampleFunctions(dependencies);

            functions.invoker();

            expect(dependencies.sideEffects.example).toHaveBeenCalled();
        });
    });
});
