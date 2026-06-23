import { beforeAll } from "vitest";
import { setProjectAnnotations } from "@storybook/nextjs-vite";
import * as projectAnnotations from "./preview";

// Apply Storybook's project-level config (decorators, params) to the Vitest run.
const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
