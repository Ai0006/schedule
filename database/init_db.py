import sqlite3
import bcrypt
import os

DB_PATH = 'database/park_reservation.db'

def init_db():
    # 既存のDBファイルがあれば削除して再作成 (スキーマ変更のため)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"既存のデータベースファイル '{DB_PATH}' を削除しました。")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Parksテーブルの作成
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS Parks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
    ''')
    print("Parksテーブルを作成または確認しました。")

    # Parksテーブルにサンプルデータを挿入
    parks_data = ["中央公園", "ひだまり公園", "こかげ公園", "緑地公園", "キッズパーク"]
    for park_name in parks_data:
        try:
            cursor.execute("INSERT INTO Parks (name) VALUES (?)", (park_name,))
        except sqlite3.IntegrityError:
            print(f"公園 '{park_name}' は既に存在します。") # 実際には IF NOT EXISTS であれば不要
    conn.commit()
    print(f"{len(parks_data)}件の公園データを挿入または確認しました。")


    # Reservationsテーブルの作成 (park_name を追加)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS Reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        park_name TEXT NOT NULL,
        start_datetime TEXT NOT NULL,
        end_datetime TEXT NOT NULL,
        is_exclusive INTEGER NOT NULL,
        purpose TEXT NOT NULL,
        organization_name TEXT NOT NULL,
        grade TEXT,
        number_of_people INTEGER NOT NULL,
        contact_info TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (park_name) REFERENCES Parks(name)
    )
    ''')
    print("Reservationsテーブルを新しいスキーマで作成または確認しました。")

    # Adminsテーブルの作成
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS Admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    print("Adminsテーブルを作成または確認しました。")

    # Announcementsテーブルの作成
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS Announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    print("Announcementsテーブルを作成または確認しました。")

    conn.commit()

    # 初期管理者を登録 (これはconnを再度開く必要はない)
    # cursor = conn.cursor() # cursorは既に存在
    cursor.execute("SELECT * FROM Admins WHERE username = 'admin'")
    if cursor.fetchone() is None:
        hashed_password = bcrypt.hashpw('admin_password'.encode('utf-8'), bcrypt.gensalt())
        cursor.execute("INSERT INTO Admins (username, password_hash) VALUES (?, ?)",
                       ('admin', hashed_password.decode('utf-8')))
        conn.commit()
        print("初期管理者 'admin' を登録しました。")
    else:
        print("初期管理者 'admin' は既に存在します。")

    conn.close()
    print(f"\nデータベース '{DB_PATH}' の初期化が完了しました。")
    print("スキーマ変更: Reservationsテーブルに 'park_name' カラムを追加し、Parksテーブルを新設してサンプルデータを投入しました。")

if __name__ == '__main__':
    init_db()
