import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms, models
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, confusion_matrix, classification_report
import pandas as pd
import os
import warnings
warnings.filterwarnings('ignore')

# --- 1. PARAMETRELER (GÜNCELLENDİ) ---
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
EPOCHS = 100            # Hedef 100 Epoch'a çıkarıldı
BATCH_SIZE = 32
LR = 0.001

PATIENCE = 12           # Early Stopping Sabır Sınırı (12 epoch boyunca rekor kırılmazsa dur)
PV_WEIGHT = 0.6
RW_WEIGHT = 0.4

print(f"Eğitim {device} üzerinde başlatılıyor... Hedef: {EPOCHS} Epoch, Early Stopping: {PATIENCE}")

# --- 2. VERİ YÜKLEME (256x256) ---
transform = transforms.Compose([
    transforms.Resize((256, 256)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

train_dir = '/kaggle/working/train_data'
pv_val_dir = '/kaggle/working/pv_val_data'
rw_val_dir = '/kaggle/working/rw_val_data'

train_ds = datasets.ImageFolder(train_dir, transform=transform)
pv_val_ds = datasets.ImageFolder(pv_val_dir, transform=transform)
rw_val_ds = datasets.ImageFolder(rw_val_dir, transform=transform)

NUM_CLASSES = len(train_ds.classes)
class_names = train_ds.classes

train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
pv_val_loader = DataLoader(pv_val_ds, batch_size=BATCH_SIZE)
rw_val_loader = DataLoader(rw_val_ds, batch_size=BATCH_SIZE)

# --- 3. MODEL: EfficientNetV2-S ---
model = models.efficientnet_v2_s(weights='DEFAULT')
model.classifier[1] = nn.Linear(model.classifier[1].in_features, NUM_CLASSES)
model = model.to(device)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=LR)

# --- 4. DEĞERLENDİRME FONKSİYONU ---
def evaluate(loader, model):
    model.eval()
    y_true, y_pred = [], []
    loss_total = 0.0
    with torch.no_grad():
        for imgs, labels in loader:
            imgs, labels = imgs.to(device), labels.to(device)
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss_total += loss.item()
            
            preds = torch.max(outputs, 1)[1]
            y_true.extend(labels.cpu().numpy())
            y_pred.extend(preds.cpu().numpy())
            
    avg_loss = loss_total / len(loader)
    acc = accuracy_score(y_true, y_pred)
    macro_f1 = f1_score(y_true, y_pred, average='macro')
    return avg_loss, acc, macro_f1, y_true, y_pred

# --- 5. EĞİTİM DÖNGÜSÜ & EARLY STOPPING ---
history = []
best_combined_score = 0.0
epochs_no_improve = 0   # Rekor kırılamayan epoch sayacı

for epoch in range(EPOCHS):
    model.train()
    train_loss = 0.0
    y_true_train, y_pred_train = [], []
    
    for imgs, labels in train_loader:
        imgs, labels = imgs.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(imgs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        
        train_loss += loss.item()
        preds = torch.max(outputs, 1)[1]
        y_true_train.extend(labels.cpu().numpy())
        y_pred_train.extend(preds.cpu().numpy())

    # Metrikler
    t_loss = train_loss / len(train_loader)
    t_acc = accuracy_score(y_true_train, y_pred_train)
    t_f1 = f1_score(y_true_train, y_pred_train, average='macro')

    pv_loss, pv_acc, pv_f1, _, _ = evaluate(pv_val_loader, model)
    rw_loss, rw_acc, rw_f1, rw_true, rw_pred = evaluate(rw_val_loader, model)

    combined_score = (PV_WEIGHT * pv_f1) + (RW_WEIGHT * rw_f1)

    print(f"Epoch {epoch+1:02d}/{EPOCHS} | T-Loss: {t_loss:.3f} | Score: {combined_score:.3f} (PV: {pv_f1:.2f}, RW: {rw_f1:.2f})")

    # Log Kaydı
    history.append({
        'epoch': epoch+1, 'train_loss': t_loss, 'train_acc': t_acc, 'train_f1': t_f1,
        'pv_val_loss': pv_loss, 'pv_val_acc': pv_acc, 'pv_val_f1': pv_f1,
        'rw_val_loss': rw_loss, 'rw_val_acc': rw_acc, 'rw_val_f1': rw_f1,
        'combined_score': combined_score
    })

    # EARLY STOPPING KONTROLÜ
    if combined_score > best_combined_score:
        best_combined_score = combined_score
        epochs_no_improve = 0 # Rekor kırıldı, sayacı sıfırla!
        
        torch.save(model.state_dict(), '/kaggle/working/best_stage1_256.pth')
        
        report = classification_report(rw_true, rw_pred, target_names=class_names, digits=3)
        cm = confusion_matrix(rw_true, rw_pred)
        
        with open('/kaggle/working/stage1_best_results.txt', 'w') as f:
            f.write(f"--- EN IYI EPOCH: {epoch+1} ---\n")
            f.write(f"COMBINED SCORE: {combined_score:.4f}\n")
            f.write(f"PV_F1: {pv_f1:.4f} | RW_F1: {rw_f1:.4f}\n\n")
            f.write(report)
            f.write("\n")
            f.write(str(cm))
        
        print(f"  ↳ 🌟 Yeni Rekor! Model Kaydedildi. (Sabır: {epochs_no_improve}/{PATIENCE})")
    else:
        epochs_no_improve += 1
        print(f"  ↳ Rekor kırılamadı. (Sabır: {epochs_no_improve}/{PATIENCE})")

    # SABIR TAŞARSA EĞİTİMİ KES
    if epochs_no_improve >= PATIENCE:
        print(f"\n🛑 EARLY STOPPING TETİKLENDİ! {PATIENCE} epoch boyunca skor artmadı.")
        print(f"En iyi Combined Score ({best_combined_score:.3f}) korunarak eğitim bitiriliyor.")
        break

# Eğitimi bitir ve logları kaydet
pd.DataFrame(history).to_csv('/kaggle/working/stage1_256_history.csv', index=False)
print("\nİşlem tamam! Sonuçlar /kaggle/working/ dizinine kaydedildi.")