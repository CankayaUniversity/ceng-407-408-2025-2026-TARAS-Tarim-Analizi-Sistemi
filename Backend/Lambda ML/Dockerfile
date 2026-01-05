# Use AWS Lambda Python runtime base image (AL2023 with newer GCC)
FROM public.ecr.aws/lambda/python:3.12

# Install system dependencies for building packages
RUN dnf install -y \
    gcc \
    gcc-c++ \
    make \
    && dnf clean all

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy model files
COPY model/ ${LAMBDA_TASK_ROOT}/model/

# Copy Lambda handler
COPY lambda_handler.py ${LAMBDA_TASK_ROOT}/

# Set the CMD to your handler
CMD ["lambda_handler.handler"]
