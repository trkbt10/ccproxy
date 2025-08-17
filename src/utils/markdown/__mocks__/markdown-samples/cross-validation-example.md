Here's a comprehensive example:

```python
import numpy as np
from sklearn.model_selection import KFold
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

# Sample data
X = np.random.rand(100, 5)
y = np.random.randint(0, 2, 100)

# Initialize KFold
kf = KFold(n_splits=5, shuffle=True, random_state=42)

# Initialize model
model = LogisticRegression()

# Cross-validation scores
cv_scores = []

for train_idx, val_idx in kf.split(X):
    X_train, X_val = X[train_idx], X[val_idx]
    y_train, y_val = y[train_idx], y[val_idx]
    
    model.fit(X_train, y_train)
    y_pred = model.predict(X_val)
    score = accuracy_score(y_val, y_pred)
    cv_scores.append(score)

cv_scores = np.array(cv_scores)
print(f"\nCross-Validation Scores (Accuracy for each fold): {cv_scores}")
print(f"Mean Cross-Validation Accuracy: {cv_scores.mean():.2f}")
print(f"Standard Deviation of CV Accuracy: {cv_scores.std():.2f}")
```
**Explanation:** This code demonstrates `KFold` cross-validation. It splits the data into 5 folds, trains and evaluates the `LogisticRegression` model 5 times, and then reports the mean and standard deviation of the accuracy scores across all folds. This provides a more robust estimate of the model's performance.
