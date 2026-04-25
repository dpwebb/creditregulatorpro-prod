import React, { useState, useEffect } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Plus, Trash2 } from "lucide-react";
import styles from "./AdminVersionNotesEditor.module.css";

interface Category {
  category: string;
  items: string[];
}

interface Props {
  releaseNotesRaw: string;
  onChange: (val: string) => void;
}

export const AdminVersionNotesEditor = ({ releaseNotesRaw, onChange }: Props) => {
  const [isRaw, setIsRaw] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!isRaw) {
      try {
        const parsed = JSON.parse(releaseNotesRaw || "[]");
        if (Array.isArray(parsed)) {
          // Normalize elements to ensure category and items exist
          const normalized = parsed.map((p) => ({
            category: p.category || "New Category",
            items: Array.isArray(p.items) ? p.items : [],
          }));
          setCategories(normalized);
        }
      } catch (e) {
        // Handle malformed JSON gracefully; could keep it as raw or empty
      }
    }
  }, [releaseNotesRaw, isRaw]);

  const notifyChange = (cats: Category[]) => {
    onChange(JSON.stringify(cats, null, 2));
  };

  const addCategory = () => {
    const newCats = [...categories, { category: "New Category", items: [""] }];
    setCategories(newCats);
    notifyChange(newCats);
  };

  const removeCategory = (idx: number) => {
    const newCats = categories.filter((_, i) => i !== idx);
    setCategories(newCats);
    notifyChange(newCats);
  };

  const updateCategoryName = (idx: number, name: string) => {
    const newCats = [...categories];
    newCats[idx].category = name;
    setCategories(newCats);
    notifyChange(newCats);
  };

  const addItem = (catIdx: number) => {
    const newCats = [...categories];
    newCats[catIdx].items.push("");
    setCategories(newCats);
    notifyChange(newCats);
  };

  const removeItem = (catIdx: number, itemIdx: number) => {
    const newCats = [...categories];
    newCats[catIdx].items = newCats[catIdx].items.filter((_, i) => i !== itemIdx);
    setCategories(newCats);
    notifyChange(newCats);
  };

  const updateItem = (catIdx: number, itemIdx: number, val: string) => {
    const newCats = [...categories];
    newCats[catIdx].items[itemIdx] = val;
    setCategories(newCats);
    notifyChange(newCats);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Release Notes</span>
        <Button size="sm" variant="ghost" onClick={() => setIsRaw(!isRaw)}>
          {isRaw ? "Structured Editor" : "Raw JSON"}
        </Button>
      </div>

      {isRaw ? (
        <Textarea
          rows={10}
          value={releaseNotesRaw}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'[\n  { "category": "Features", "items": ["Added X"] }\n]'}
        />
      ) : (
        <div className={styles.editor}>
          {categories.length === 0 && (
            <div className={styles.emptyState}>No release notes added yet.</div>
          )}
          {categories.map((cat, cIdx) => (
            <div key={cIdx} className={styles.categoryBlock}>
              <div className={styles.catHeader}>
                <Input
                  value={cat.category}
                  onChange={(e) => updateCategoryName(cIdx, e.target.value)}
                  className={styles.catInput}
                  placeholder="Category Name (e.g. New Features)"
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className={styles.dangerBtn}
                  onClick={() => removeCategory(cIdx)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <div className={styles.itemsList}>
                {cat.items.map((item, iIdx) => (
                  <div key={iIdx} className={styles.itemRow}>
                    <div className={styles.bullet}>•</div>
                    <Input
                      value={item}
                      onChange={(e) => updateItem(cIdx, iIdx, e.target.value)}
                      className={styles.itemInput}
                      placeholder="Note item description"
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className={styles.dangerBtn}
                      onClick={() => removeItem(cIdx, iIdx)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className={styles.addItemBtn}
                  onClick={() => addItem(cIdx)}
                >
                  <Plus size={14} /> Add Item
                </Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" className={styles.addCatBtn} onClick={addCategory}>
            <Plus size={14} /> Add Category
          </Button>
        </div>
      )}
    </div>
  );
};