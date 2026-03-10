export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  payments: {
    grpcUrl: process.env.PAYMENTS_GRPC_URL || 'localhost:5001',
    grpcTimeoutMs: parseInt(process.env.PAYMENTS_GRPC_TIMEOUT_MS ?? '5000', 10),
    grpcRetryAttempts: parseInt(
      process.env.PAYMENTS_GRPC_RETRY_ATTEMPTS ?? '3',
      10,
    ),
    grpcRetryDelayMs: parseInt(
      process.env.PAYMENTS_GRPC_RETRY_DELAY_MS ?? '200',
      10,
    ),
  },
});
