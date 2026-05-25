#!/usr/bin/env bun
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("# Add these to .env (and update VITE_VAPID_PUBLIC_KEY to match):");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
