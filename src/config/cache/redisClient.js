const { createClient } = require("redis");

const client = createClient({
  url: `redis://${process.env.REDIS_HOST || "localhost"}:${
    process.env.REDIS_PORT || 6379
  }`,
});

client.on("error", (err) => console.error("Redis Error:", err));

client.connect();

module.exports = client;
