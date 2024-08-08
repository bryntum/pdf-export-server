#!/bin/bash

if [ -z "$1" ]
    then
        echo "ERROR: Argument 1 (project_id) is required"
        exit 1
    else
        project_id=$1
fi

if [ -z "$2" ]
    then
        echo "ERROR: Argument 2 (service_name) is required"
        exit 1
    else
        service_name=$2
fi

if [ -z "$3" ]
    then
        echo "ERROR: Argument 3 (image_tag) is required"
        exit 1
    else
        image_tag=$3
fi

image_uri="us-docker.pkg.dev/combocurve-registry/combocurve-docker/$service_name:$image_tag"

if ! docker manifest inspect "${{ image_uri }}"; then
    echo "image_exists=false"
    docker build \
    -t "$image_uri" \
    --build-arg SERVICE_NAME_FOLDER=./ \
    . || exit 1

    docker push "$image_uri" || exit 1
fi


