# Use Node.js LTS (Long Term Support) image
FROM node:20-slim

# Create and change to the app directory
WORKDIR /usr/src/app

# Python + MarkItDown (scripts/seda_ai_assistant.py — SEDA Upload AI Assistant).
# node:20-slim is Debian, so python3/pip3 aren't present by default.
# --break-system-packages: this container runs nothing else Python-based, so PEP 668's
# "externally managed environment" guard has nothing to protect here.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json and package-lock.json are copied.
# Copying this separately prevents re-running npm install on every code change.
COPY package*.json ./

# Install production dependencies.
RUN npm install --omit=dev

# Copy local code to the container image.
COPY . .

# Ensure the storage directory exists
RUN mkdir -p storage && chmod 777 storage

# Expose the port the app runs on
EXPOSE 3000

# Run the web service on container startup.
CMD [ "npm", "start" ]
