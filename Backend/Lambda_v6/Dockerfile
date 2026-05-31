# v8 3-way disease ensemble Lambda — arm64 (Graviton, matches existing fn arch).
# Build context = project root, so we can COPY both Backend/Lambda_v6/* and ML/*.
#
#   docker buildx build --platform linux/arm64 \
#     -t taras-disease-detection:v6 \
#     -f Backend/Lambda_v6/Dockerfile .

FROM public.ecr.aws/lambda/python:3.11-arm64

COPY Backend/Lambda_v6/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --only-binary=:all: -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

# Inference code from the ML release. inference_lambda.py reads labels at
# HERE/../shared/labels.json, so put it in /var/task/shared/.
RUN mkdir -p /var/task/code /var/task/shared
COPY ML/inference/inference_lambda.py     /var/task/code/
COPY ML/inference/preprocess.py           /var/task/code/
COPY ML/inference/ensemble_config.json    /var/task/code/
COPY ML/inference/labels.json             /var/task/shared/labels.json

# 745 MB of ensemble checkpoints (gitignored in ML/.gitignore but present on disk)
COPY ML/models/ensemble_v8/v20_convnextv2_best.pt   /var/task/code/
COPY ML/models/ensemble_v8/v26r_swin_s_384_best.pt  /var/task/code/
COPY ML/models/ensemble_v8/v32_swin_b_field_best.pt /var/task/code/

# Adapter (entrypoint)
COPY Backend/Lambda_v6/handler.py /var/task/

CMD ["handler.lambda_handler"]
