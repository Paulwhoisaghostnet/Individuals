# Runtime secret files

This directory is mounted read-only at `/run/secrets` inside the runtime container.
Every file except this README is ignored by Git and the container build context.

For curator controls, create `deploy/secrets/curator-token` containing at least 32
random bytes and set:

```dotenv
INDIVIDUALS_CURATOR_TOKEN_FILE=/run/secrets/curator-token
```

For model-backed cognition, create `deploy/secrets/llm-api-key` and set:

```dotenv
LLM_API_KEY_FILE=/run/secrets/llm-api-key
```

The container runs as a non-root user. Make the files `0640`, make this directory
`0750`, and assign both to the Linux group whose numeric GID is configured by
`INDIVIDUALS_SECRET_GID`. Compose adds that group to the runtime process. Do not
make secrets world-readable or add values to Compose YAML, shell history, client
build variables, or this README.
