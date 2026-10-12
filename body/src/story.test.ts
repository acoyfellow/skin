import { test } from "vitest";
import { checks } from "./check";
import "./checks";

for (const check of checks) test(check.name, check.run);
