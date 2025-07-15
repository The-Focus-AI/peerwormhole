FROM node:18-bookworm-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libffi-dev \
    python3-dev

WORKDIR /workspace

COPY "./" "./"
RUN npm install
CMD npm run start