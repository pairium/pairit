import { describe, expect, test } from "bun:test";
import { isLoopbackMongoUri } from "./index";

describe("isLoopbackMongoUri", () => {
	test("local addresses are loopback", () => {
		expect(isLoopbackMongoUri("mongodb://localhost:27017/pairit")).toBe(true);
		expect(isLoopbackMongoUri("mongodb://127.0.0.1/pairit")).toBe(true);
		expect(isLoopbackMongoUri("mongodb://u:p@[::1]:27017/pairit")).toBe(true);
		expect(
			isLoopbackMongoUri("mongodb://localhost:27017,127.0.0.1:27018/x"),
		).toBe(true);
	});

	test("remote addresses are not", () => {
		expect(
			isLoopbackMongoUri("mongodb+srv://u:p@cluster0.abc.mongodb.net/pairit"),
		).toBe(false);
		expect(isLoopbackMongoUri("mongodb://localhost,db.example.com/x")).toBe(
			false,
		);
		expect(isLoopbackMongoUri("mongodb://localhost.evil.com/x")).toBe(false);
		expect(isLoopbackMongoUri("not a uri")).toBe(false);
	});
});
