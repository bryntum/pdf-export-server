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

if [ -z "$4" ]
    then
        echo "ERROR: Argument 4 (region) is required"
        exit 1
    else
        region=$4
fi

gcloud run deploy "$service_name" \
    --image "us-docker.pkg.dev/combocurve-registry/combocurve-docker/$service_name:$image_tag" \
    --region "$region" \
    --platform managed \
    --flags-file .run.yaml \
    --set-env-vars NODE_ENV=production \
    || exit 1
