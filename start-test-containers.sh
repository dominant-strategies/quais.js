#!/bin/bash

# Check if the quai-local-node directory exists, if not, clone it
if [ ! -d "./quai-local-node" ]; then
  echo "quai-local-node directory not found. Cloning from GitHub..."
  git clone https://github.com/dominant-strategies/quai-local-node.git
  if [ $? -ne 0 ]; then
    echo "Failed to clone quai-local-node repository. Exiting."
    exit 1
  fi
  echo "Successfully cloned quai-local-node."
fi

# Bring up the Docker containers
docker-compose -f ./quai-local-node/docker-compose.yml up -d

# Function to check if the API is responding correctly
check_service() {
  local url=$1
  local data=$2
  local attempts=0
  local max_attempts=100  # Maximum number of attempts to avoid infinite loops

  while [ $attempts -lt $max_attempts ]; do
    response=$(curl -s -X POST -H "Content-Type: application/json" -d "$data" $url)
    connection_refused=$(echo $response | grep -c "Failed to connect")
    valid_response=$(echo $response | grep -c '"hash"')

    if [ $connection_refused -eq 0 ] && [ $valid_response -gt 0 ]; then
      echo "Service at $url is up and returned a valid response with a hash"
      return 0
    else
      echo "Waiting for $url to return a valid response with a hash..."
      ((attempts++))
      sleep 2  # Wait for 2 seconds before checking again
    fi
  done

  echo "Error: $url did not return a valid response with a hash after $attempts attempts."
  echo "Last response: $response"
  return 1
}

# JSON payload to send in the POST request
payload='{
    "jsonrpc": "2.0",
    "method": "quai_getBlockByNumber",
    "params": [
        "0x1",
        false
    ],
    "id": 1
}'

# Wait for the service on localhost:9200 to respond correctly
check_service "http://localhost:9200" "$payload" || exit 1

echo "Test containers are up and running."
