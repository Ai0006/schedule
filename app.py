import sqlite3
import bcrypt
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from datetime import datetime
from functools import wraps

app = Flask(__name__)
# __name__ を使用して static と templates のパスを正しく解決
app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = 'dev_secret_key_placeholder' # 本番環境ではランダムで複雑なものに置き換えること

DATABASE = 'database/park_reservation.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return render_template('index.html')

# 1. 予約作成 (POST /api/reservations)
@app.route('/api/reservations', methods=['POST'])
def create_reservation():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid input"}), 400

    required_fields = ['park_name', 'start_datetime', 'end_datetime', 'is_exclusive', 'purpose', 'organization_name', 'number_of_people', 'contact_info']
    for field in required_fields:
        if field not in data or data[field] is None or str(data[field]).strip() == "": # 値がNoneや空文字列も許容しない
            return jsonify({"error": f"Missing or empty field: {field}"}), 400

    park_name = data['park_name']
    start_datetime = data['start_datetime']
    end_datetime = data['end_datetime']
    is_exclusive = data['is_exclusive']
    purpose = data['purpose']
    organization_name = data['organization_name']
    grade = data.get('grade') # Optional
    number_of_people = data['number_of_people']
    contact_info = data['contact_info']
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    try:
        conn = get_db_connection()
        # Check if park_name exists
        park_exists = conn.execute('SELECT 1 FROM Parks WHERE name = ?', (park_name,)).fetchone()
        if not park_exists:
            conn.close()
            return jsonify({'success': False, 'message': '指定された公園名は存在しません'}), 400

        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO Reservations (park_name, start_datetime, end_datetime, is_exclusive, purpose, organization_name, grade, number_of_people, contact_info, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (park_name, start_datetime, end_datetime, is_exclusive, purpose, organization_name, grade, number_of_people, contact_info, now, now))
        conn.commit()
        reservation_id = cursor.lastrowid
        # Fetch the created reservation to return it
        created_reservation = conn.execute("SELECT * FROM Reservations WHERE id = ?", (reservation_id,)).fetchone()
        conn.close()
        return jsonify({"message": "Reservation created successfully", "id": reservation_id, "reservation": dict(created_reservation)}), 201
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500

# 2. 予約一覧取得 (GET /api/reservations)
@app.route('/api/reservations', methods=['GET'])
def get_reservations():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Select all fields explicitly to be clear, including park_name
        cursor.execute("""
            SELECT id, park_name, start_datetime, end_datetime, is_exclusive, purpose,
                   organization_name, grade, number_of_people, contact_info,
                   status, created_at, updated_at
            FROM Reservations
            ORDER BY start_datetime DESC
        """)
        reservations = cursor.fetchall()
        conn.close()
        return jsonify([dict(row) for row in reservations]), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500

# 3. 個別予約取得 (GET /api/reservations/<int:reservation_id>)
@app.route('/api/reservations/<int:reservation_id>', methods=['GET'])
def get_reservation(reservation_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Select all fields explicitly
        cursor.execute("""
            SELECT id, park_name, start_datetime, end_datetime, is_exclusive, purpose,
                   organization_name, grade, number_of_people, contact_info,
                   status, created_at, updated_at
            FROM Reservations WHERE id = ?
        """, (reservation_id,))
        reservation = cursor.fetchone()
        conn.close()
        if reservation:
            return jsonify(dict(reservation)), 200
        else:
            return jsonify({"error": "Reservation not found"}), 404
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500

# 4. 予約更新 (PUT /api/reservations/<int:reservation_id>)
@app.route('/api/reservations/<int:reservation_id>', methods=['PUT'])
def update_reservation(reservation_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid input"}), 400

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    fields_to_update = []
    values_to_update = []

    # 更新可能なフィールドを動的に構築
    allowed_fields = ['start_datetime', 'end_datetime', 'is_exclusive', 'purpose', 'organization_name', 'grade', 'number_of_people', 'contact_info', 'status']
    for field in allowed_fields:
        if field in data:
            fields_to_update.append(f"{field} = ?")
            values_to_update.append(data[field])

    if not fields_to_update:
        return jsonify({"error": "No fields to update"}), 400

    fields_to_update.append("updated_at = ?")
    values_to_update.append(now)
    values_to_update.append(reservation_id)

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(f"UPDATE Reservations SET {', '.join(fields_to_update)} WHERE id = ?", tuple(values_to_update))
        conn.commit()

        if cursor.rowcount == 0:
            conn.close()
            return jsonify({"error": "Reservation not found or no change made"}), 404

        # 更新後のデータを取得して返す
        cursor.execute("SELECT * FROM Reservations WHERE id = ?", (reservation_id,))
        updated_reservation = cursor.fetchone()
        conn.close()
        return jsonify(dict(updated_reservation)), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500

# 5. 予約削除 (DELETE /api/reservations/<int:reservation_id>)
@app.route('/api/reservations/<int:reservation_id>', methods=['DELETE'])
def delete_reservation(reservation_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM Reservations WHERE id = ?", (reservation_id,))
        conn.commit()

        if cursor.rowcount == 0:
            conn.close()
            return jsonify({"error": "Reservation not found"}), 404

        conn.close()
        return jsonify({"message": "Reservation deleted successfully"}), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500

# --- Admin Authentication ---
@app.route('/api/admin/login', methods=['POST'])
def admin_login_api():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'success': False, 'message': 'ユーザー名とパスワードを入力してください'}), 400

    conn = get_db_connection()
    admin = conn.execute('SELECT * FROM Admins WHERE username = ?', (username,)).fetchone()
    conn.close()

    if admin and bcrypt.checkpw(password.encode('utf-8'), admin['password_hash'].encode('utf-8')):
        session['admin_logged_in'] = True
        session['admin_username'] = username
        return jsonify({'success': True, 'message': 'ログイン成功'})
    else:
        return jsonify({'success': False, 'message': 'ユーザー名またはパスワードが間違っています'}), 401

@app.route('/api/admin/logout', methods=['POST'])
def admin_logout_api():
    session.pop('admin_logged_in', None)
    session.pop('admin_username', None)
    return jsonify({'success': True, 'message': 'ログアウトしました'})

def admin_login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            # nextパラメータでリダイレクト先を指定できるようにする
            login_url = url_for('admin_login_page', next=request.url)
            if request.headers.get("X-Requested-With") == "XMLHttpRequest": # APIアクセスの場合はJSONでエラー
                return jsonify(error="ログインが必要です。", redirect_url=login_url), 401
            return redirect(login_url)
        return f(*args, **kwargs)
    return decorated_function

# API for admin to update reservation status
@app.route('/api/admin/reservations/<int:reservation_id>/status', methods=['POST'])
@admin_login_required
def update_reservation_status(reservation_id):
    data = request.get_json()
    new_status = data.get('status')

    # 'cancelled_by_admin' や 'completed' など、運用に応じてステータスを追加
    valid_statuses = ['approved', 'rejected', 'pending', 'cancelled', 'cancelled_by_admin', 'completed']
    if new_status not in valid_statuses:
        return jsonify({'success': False, 'message': '無効なステータスです'}), 400

    conn = get_db_connection()
    reservation = conn.execute('SELECT * FROM Reservations WHERE id = ?', (reservation_id,)).fetchone()
    if reservation is None:
        conn.close()
        return jsonify({'success': False, 'message': '予約が見つかりません'}), 404

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute('UPDATE Reservations SET status = ?, updated_at = ? WHERE id = ?',
                 (new_status, now, reservation_id))
    conn.commit()
    updated_reservation = conn.execute('SELECT * FROM Reservations WHERE id = ?', (reservation_id,)).fetchone()
    conn.close()
    return jsonify({'success': True, 'message': 'ステータスを更新しました', 'reservation': dict(updated_reservation)})

# Add admin_login_required to existing PUT and DELETE for reservations
@app.route('/api/reservations/<int:reservation_id>', methods=['PUT'])
@admin_login_required # Added
def update_reservation(reservation_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid input"}), 400

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    conn = get_db_connection()
    # Check if reservation exists first
    current_reservation = conn.execute("SELECT * FROM Reservations WHERE id = ?", (reservation_id,)).fetchone()
    if not current_reservation:
        conn.close()
        return jsonify({"error": "Reservation not found"}), 404

    fields_to_update = []
    params = []

    # Define allowed fields for update by admin
    # park_name is handled separately due to existence check
    allowed_fields = ['start_datetime', 'end_datetime', 'is_exclusive',
                      'purpose', 'organization_name', 'grade',
                      'number_of_people', 'contact_info', 'status']

    for field in allowed_fields:
        if field in data:
            fields_to_update.append(f"{field} = ?")
            params.append(data[field])

    park_name = data.get('park_name')
    if park_name is not None: # If park_name is part of the update request
        if not park_name.strip():
            conn.close()
            return jsonify({'success': False, 'message': '公園名を空にすることはできません'}), 400
        park_exists = conn.execute('SELECT 1 FROM Parks WHERE name = ?', (park_name,)).fetchone()
        if not park_exists:
            conn.close()
            return jsonify({'success': False, 'message': '指定された公園名は存在しません'}), 400
        fields_to_update.append("park_name = ?")
        params.append(park_name)

    if not fields_to_update: # No actual fields to update
        conn.close()
        # Or, return current data if no change is also OK.
        return jsonify({"error": "No fields to update or invalid fields provided"}), 400

    fields_to_update.append("updated_at = ?")
    params.append(now_str)
    params.append(reservation_id) # For the WHERE clause

    sql = f"UPDATE Reservations SET {', '.join(fields_to_update)} WHERE id = ?"

    try:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        conn.commit()

        if cursor.rowcount == 0: # Should not happen if existence is checked above
            conn.close()
            return jsonify({"error": "Reservation not found or no change made"}), 404

        updated_reservation = conn.execute("SELECT * FROM Reservations WHERE id = ?", (reservation_id,)).fetchone()
        conn.close()
        return jsonify(dict(updated_reservation)), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/reservations/<int:reservation_id>', methods=['DELETE'])
@admin_login_required # Added
def delete_reservation(reservation_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM Reservations WHERE id = ?", (reservation_id,))
        conn.commit()

        if cursor.rowcount == 0:
            conn.close()
            return jsonify({"error": "Reservation not found"}), 404

        conn.close()
        return jsonify({"message": "Reservation deleted successfully"}), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# --- Admin Pages ---
@app.route('/admin/login')
def admin_login_page():
    if session.get('admin_logged_in'): # 既にログインしていたらダッシュボードへ
        return redirect(url_for('admin_dashboard_page'))
    return render_template('admin/login.html')

@app.route('/admin/dashboard')
@admin_login_required
def admin_dashboard_page():
    return render_template('admin/dashboard.html')

@app.route('/admin/reservations/new', methods=['GET'])
@admin_login_required
def new_reservation_page():
    return render_template('admin/edit_reservation.html', reservation_id=None, reservation_data=None)

@app.route('/admin/reservations/<int:reservation_id>/edit', methods=['GET'])
@admin_login_required
def edit_reservation_page(reservation_id):
    # Optionally fetch data here, or let JS do it. For simplicity, JS will fetch.
    return render_template('admin/edit_reservation.html', reservation_id=reservation_id, reservation_data=None)

# --- Park Management APIs ---

@app.route('/api/parks', methods=['GET'])
def get_parks():
    conn = get_db_connection()
    parks_cursor = conn.execute('SELECT id, name FROM Parks ORDER BY name')
    parks = [dict(row) for row in parks_cursor.fetchall()]
    conn.close()
    return jsonify(parks)

@app.route('/api/admin/parks', methods=['POST'])
@admin_login_required
def add_park():
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({'success': False, 'message': '公園名は必須です'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.execute('INSERT INTO Parks (name) VALUES (?)', (name,))
        conn.commit()
        new_park_id = cursor.lastrowid
        # Fetch the newly added park to return consistent data (especially if 'name' could be transformed)
        new_park = conn.execute('SELECT id, name FROM Parks WHERE id = ?', (new_park_id,)).fetchone()
        conn.close()
        return jsonify({'success': True, 'message': '公園を追加しました', 'park': dict(new_park)}), 201
    except sqlite3.IntegrityError: # UNIQUE constraint failed
        conn.close()
        return jsonify({'success': False, 'message': '同じ名前の公園が既に存在します'}), 409
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/admin/parks/<int:park_id>', methods=['PUT'])
@admin_login_required
def update_park(park_id):
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({'success': False, 'message': '公園名は必須です'}), 400

    conn = get_db_connection()
    existing_park = conn.execute('SELECT * FROM Parks WHERE id = ?', (park_id,)).fetchone()
    if not existing_park:
        conn.close()
        return jsonify({'success': False, 'message': '指定された公園が見つかりません'}), 404

    try:
        conn.execute('UPDATE Parks SET name = ? WHERE id = ?', (name, park_id))
        conn.commit()
        updated_park = conn.execute('SELECT id, name FROM Parks WHERE id = ?', (park_id,)).fetchone()
        conn.close()
        return jsonify({'success': True, 'message': '公園情報を更新しました', 'park': dict(updated_park)})
    except sqlite3.IntegrityError: # UNIQUE constraint failed
        conn.close()
        return jsonify({'success': False, 'message': '同じ名前の公園が既に存在します'}), 409
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/admin/parks/<int:park_id>', methods=['DELETE'])
@admin_login_required
def delete_park(park_id):
    conn = get_db_connection()
    existing_park = conn.execute('SELECT * FROM Parks WHERE id = ?', (park_id,)).fetchone()
    if not existing_park:
        conn.close()
        return jsonify({'success': False, 'message': '指定された公園が見つかりません'}), 404

    try:
        # Enable foreign key support for this connection if not enabled globally
        # conn.execute("PRAGMA foreign_keys = ON")
        conn.execute('DELETE FROM Parks WHERE id = ?', (park_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': '公園を削除しました'})
    except sqlite3.IntegrityError as e:
        conn.close()
        if "FOREIGN KEY constraint failed" in str(e) or "constraint failed" in str(e).lower() : # Check for constraint violation
             return jsonify({'success': False, 'message': 'この公園は予約で使用されているため削除できません。先に該当する予約を削除または変更してください。'}), 409
        return jsonify({'success': False, 'message': f'データベースエラー: {str(e)}'}), 500
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
