import { Hono } from "hono";
import { handleContact } from "./contact.handler.js";

const contact = new Hono();

contact.post("/", handleContact);

export default contact;
