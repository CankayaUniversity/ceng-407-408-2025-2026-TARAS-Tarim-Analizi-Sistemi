# syntax=docker/dockerfile:1.6
FROM public.ecr.aws/lambda/python:3.12

# No gcc/g++/make - torch, torchvision, and pillow all ship prebuilt manylinux
# wheels for x86_64 Python 3.12. Adding compilers just to "be safe" was 200 MB
# of dead weight in the old image.

# Install Python deps first (rarely changes) so code edits don't bust the cache.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY lambda_handler.py inference.py labels.py config.py ${LAMBDA_TASK_ROOT}/

# Model weights - mount point for the 213 MB state dict.
# The file is gitignored; whoever builds the image must place it here first.
# See README.md for how to obtain it.
COPY model/ ${LAMBDA_TASK_ROOT}/model/

# --- Build-time test gate ---
# Tests run INSIDE the image during build. Any failure (missing fixtures,
# inference regression, class drift) fails `docker build` with a non-zero
# exit, stopping the deploy pipeline. Pytest and the fixtures are removed
# in the same RUN so they do not persist in the final image layer.
COPY tests/ /tmp/tests/
RUN pip install --no-cache-dir pytest==8.3.4 && \
    PYTHONPATH=${LAMBDA_TASK_ROOT} python -m pytest /tmp/tests/ -q -x && \
    pip uninstall -y pytest iniconfig pluggy packaging && \
    rm -rf /tmp/tests/ /root/.cache/pip

CMD ["lambda_handler.handler"]
