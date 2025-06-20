document.addEventListener('DOMContentLoaded', () => {
    // General elements
    const loginMessageArea = document.getElementById('login-message-area');
    const editMessageArea = document.getElementById('edit-message-area'); // For reservation edit page
    const parkMessageArea = document.getElementById('park-message-area'); // For park management on dashboard
    const editParkModalMessageArea = document.getElementById('edit-park-modal-message-area');


    // Helper to show messages
    function showMessage(area, message, type) {
        if (area) {
            area.textContent = message;
            area.className = ''; // Clear previous classes
            area.classList.add(type); // 'success', 'error', or 'info'
        }
    }

    function clearMessage(area) {
        if (area) {
            area.textContent = '';
            area.className = '';
        }
    }

    // Helper to format datetime-local string from DB timestamp
    function formatToDateTimeLocal(dateTimeStr) {
        if (!dateTimeStr) return '';
        const date = new Date(dateTimeStr.replace(' ', 'T'));
        if (isNaN(date.getTime())) return '';

        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // --- Login Page Logic ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearMessage(loginMessageArea);
            const username = loginForm.username.value;
            const password = loginForm.password.value;

            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });
                const result = await response.json();
                if (result.success) {
                    showMessage(loginMessageArea, result.message, 'success');
                    const urlParams = new URLSearchParams(window.location.search);
                    const nextUrl = urlParams.get('next');
                    window.location.href = nextUrl || '/admin/dashboard';
                } else {
                    showMessage(loginMessageArea, result.message, 'error');
                }
            } catch (error) {
                console.error('Login error:', error);
                showMessage(loginMessageArea, 'ログイン処理中にエラーが発生しました。', 'error');
            }
        });
    }

    // --- Dashboard Page Logic ---
    const logoutButton = document.getElementById('logout-button');
    const reservationsTableBody = document.querySelector('#reservations-table tbody');
    const parksTableBody = document.querySelector('#parks-table tbody');
    const addParkForm = document.getElementById('add-park-form');

    const editParkModal = document.getElementById('edit-park-modal');
    const closeEditParkModalButton = document.getElementById('close-edit-park-modal');
    const saveEditedParkButton = document.getElementById('save-edited-park');
    const cancelEditParkButton = document.getElementById('cancel-edit-park');
    const editParkIdInput = document.getElementById('edit-park-id');
    const editParkNameInput = document.getElementById('edit-park-name-input');


    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/admin/logout', { method: 'POST' });
                const result = await response.json();
                if (result.success) {
                    window.location.href = '/admin/login';
                } else {
                    alert(result.message || 'ログアウトに失敗しました。');
                }
            } catch (error) {
                console.error('Logout error:', error);
                alert('ログアウト処理中にエラーが発生しました。');
            }
        });
    }

    if (reservationsTableBody) {
        async function loadReservationsTable() {
            try {
                const response = await fetch('/api/reservations');
                if (!response.ok) {
                    if (response.status === 401) {
                        const errorData = await response.json();
                        if (errorData.redirect_url) window.location.href = errorData.redirect_url;
                        return;
                    }
                    throw new Error(`Failed to load reservations: ${response.status}`);
                }
                const reservations = await response.json();
                renderReservations(reservations);
            } catch (error) {
                console.error('Error loading reservations:', error);
                reservationsTableBody.innerHTML = `<tr><td colspan="10">予約の読み込み中にエラーが発生しました: ${error.message}</td></tr>`;
            }
        }

        function renderReservations(reservations) {
            reservationsTableBody.innerHTML = '';
            if (reservations.length === 0) {
                reservationsTableBody.innerHTML = `<tr><td colspan="10">現在、予約はありません。</td></tr>`;
                return;
            }
            reservations.forEach(res => {
                const row = reservationsTableBody.insertRow();
                row.dataset.reservationId = res.id;

                row.insertCell().textContent = res.id;
                row.insertCell().textContent = res.organization_name;
                row.insertCell().textContent = res.park_name || '未設定';
                row.insertCell().textContent = formatDateTimeAdmin(res.start_datetime);
                row.insertCell().textContent = formatDateTimeAdmin(res.end_datetime);
                row.insertCell().textContent = res.purpose;
                row.insertCell().textContent = res.number_of_people;
                row.insertCell().textContent = res.contact_info;
                row.insertCell().textContent = res.status;
                row.insertCell().textContent = formatDateTimeAdmin(res.created_at);

                const actionsCell = row.insertCell();
                actionsCell.classList.add('action-buttons');

                if (res.status === 'pending') {
                    actionsCell.appendChild(createActionButton('承認', 'approve-button', () => updateStatus(res.id, 'approved')));
                    actionsCell.appendChild(createActionButton('却下', 'reject-button', () => updateStatus(res.id, 'rejected')));
                } else if (res.status === 'approved') {
                     actionsCell.appendChild(createActionButton('利用者都合C', 'cancel-button', () => updateStatus(res.id, 'cancelled')));
                     actionsCell.appendChild(createActionButton('管理者都合C', 'admin-cancel-button', () => updateStatus(res.id, 'cancelled_by_admin')));
                }

                actionsCell.appendChild(createActionButton('編集', 'edit-button', () => window.location.href = `/admin/reservations/${res.id}/edit`));
                actionsCell.appendChild(createActionButton('削除', 'delete-button', () => deleteReservation(res.id)));
            });
        }

        function createActionButton(text, className, onClick) {
            const button = document.createElement('button');
            button.textContent = text;
            button.className = className;
            button.type = 'button';
            button.addEventListener('click', onClick);
            return button;
        }

        async function updateStatus(reservationId, newStatus) {
            if (!confirm(`予約ID ${reservationId} のステータスを「${newStatus}」に変更しますか？`)) return;
            try {
                const response = await fetch(`/api/admin/reservations/${reservationId}/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                });
                const result = await response.json();
                if (result.success) {
                    alert(`予約ID ${reservationId} のステータスを更新しました。`);
                    loadReservationsTable();
                } else {
                    alert(result.message || 'ステータスの更新に失敗しました。');
                }
            } catch (error) {
                console.error('Error updating status:', error);
                alert('ステータス更新処理中にエラーが発生しました。');
            }
        }

        async function deleteReservation(reservationId) {
            if (!confirm(`予約ID ${reservationId} を本当に削除しますか？この操作は元に戻せません。`)) return;
            try {
                const response = await fetch(`/api/reservations/${reservationId}`, { method: 'DELETE' });
                const result = await response.json();
                if (response.ok) {
                    alert(result.message || '予約を削除しました。');
                    loadReservationsTable();
                } else {
                    alert(result.error || '予約の削除に失敗しました。');
                }
            } catch (error) {
                console.error('Error deleting reservation:', error);
                alert('予約削除処理中にエラーが発生しました。');
            }
        }

        function formatDateTimeAdmin(dateTimeStr) {
            if (!dateTimeStr) return '-';
            try {
                const date = new Date(dateTimeStr);
                return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            } catch (e) { return dateTimeStr; }
        }

        loadReservationsTable();
    }

    if (parksTableBody && addParkForm && editParkModal) {
        async function loadParksTable() {
            try {
                const response = await fetch('/api/parks');
                if (!response.ok) throw new Error(`Failed to load parks: ${response.status}`);
                const parks = await response.json();
                renderParks(parks);
            } catch (error) {
                console.error('Error loading parks:', error);
                parksTableBody.innerHTML = `<tr><td colspan="3">公園リストの読み込み中にエラーが発生しました: ${error.message}</td></tr>`;
            }
        }

        function renderParks(parks) {
            parksTableBody.innerHTML = '';
            if (parks.length === 0) {
                parksTableBody.innerHTML = `<tr><td colspan="3">登録されている公園はありません。</td></tr>`;
                return;
            }
            parks.forEach(park => {
                const row = parksTableBody.insertRow();
                row.insertCell().textContent = park.id;
                row.insertCell().textContent = park.name;

                const actionsCell = row.insertCell();
                actionsCell.classList.add('action-buttons');
                actionsCell.appendChild(createActionButton('編集', 'edit-park-btn', () => openEditParkModal(park.id, park.name)));
                actionsCell.appendChild(createActionButton('削除', 'delete-park-btn', () => deletePark(park.id, park.name)));
            });
        }

        addParkForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearMessage(parkMessageArea);
            const newParkNameInput = document.getElementById('new-park-name');
            const parkName = newParkNameInput.value.trim();
            if (!parkName) {
                showMessage(parkMessageArea, '公園名を入力してください。', 'error');
                return;
            }
            try {
                const response = await fetch('/api/admin/parks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: parkName }),
                });
                const result = await response.json();
                if (result.success) {
                    showMessage(parkMessageArea, result.message, 'success');
                    newParkNameInput.value = '';
                    loadParksTable();
                } else {
                    showMessage(parkMessageArea, result.message, 'error');
                }
            } catch (error) {
                console.error('Error adding park:', error);
                showMessage(parkMessageArea, '公園の追加中にエラーが発生しました。', 'error');
            }
        });

        function openEditParkModal(id, name) {
            clearMessage(editParkModalMessageArea);
            editParkIdInput.value = id;
            editParkNameInput.value = name;
            editParkModal.style.display = 'block';
        }

        function closeEditParkModal() {
            editParkModal.style.display = 'none';
        }

        closeEditParkModalButton.addEventListener('click', closeEditParkModal);
        cancelEditParkButton.addEventListener('click', closeEditParkModal);

        saveEditedParkButton.addEventListener('click', async () => {
            clearMessage(editParkModalMessageArea);
            const parkId = editParkIdInput.value;
            const newName = editParkNameInput.value.trim();
            if (!newName) {
                showMessage(editParkModalMessageArea, '公園名は空にできません。', 'error');
                return;
            }
            try {
                const response = await fetch(`/api/admin/parks/${parkId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName }),
                });
                const result = await response.json();
                if (result.success) {
                    showMessage(editParkModalMessageArea, result.message, 'success');
                    setTimeout(() => {
                        closeEditParkModal();
                        loadParksTable();
                    }, 1000);
                } else {
                    showMessage(editParkModalMessageArea, result.message, 'error');
                }
            } catch (error) {
                console.error('Error updating park:', error);
                showMessage(editParkModalMessageArea, '公園情報の更新中にエラーが発生しました。', 'error');
            }
        });

        async function deletePark(parkId, parkName) {
            if (!confirm(`公園「${parkName}」(ID: ${parkId}) を本当に削除しますか？この公園に関連する予約がある場合は削除できません。`)) return;
            clearMessage(parkMessageArea);
            try {
                const response = await fetch(`/api/admin/parks/${parkId}`, { method: 'DELETE' });
                const result = await response.json();
                if (result.success) {
                    showMessage(parkMessageArea, result.message, 'success');
                    loadParksTable();
                } else {
                    showMessage(parkMessageArea, result.message, 'error');
                }
            } catch (error) {
                console.error('Error deleting park:', error);
                showMessage(parkMessageArea, '公園の削除中にエラーが発生しました。', 'error');
            }
        }

        loadParksTable();
    }

    // --- Edit/Create Reservation Page Logic (admin/edit_reservation.html) ---
    const editReservationForm = document.getElementById('edit-reservation-form');
    // RESERVATION_ID is globally available from a script tag in edit_reservation.html
    const currentReservationId = typeof RESERVATION_ID !== 'undefined' ? RESERVATION_ID : null;

    const adminParkNameSelect = document.getElementById('admin_park_name_select');
    const adminParkNameOtherInput = document.getElementById('admin_park_name_other');

    async function loadAdminParksDropdown() {
        if (!adminParkNameSelect) return;
        try {
            const response = await fetch('/api/parks');
            if (!response.ok) {
                throw new Error('公園リストの読み込みに失敗しました。');
            }
            const parks = await response.json();
            parks.forEach(park => {
                const option = document.createElement('option');
                option.value = park.name;
                option.textContent = park.name;
                adminParkNameSelect.appendChild(option);
            });
            const otherOption = document.createElement('option');
            otherOption.value = 'other';
            otherOption.textContent = 'その他（自由入力）';
            adminParkNameSelect.appendChild(otherOption);
        } catch (error) {
            console.error('Error loading parks for admin dropdown:', error);
            if(editMessageArea) showMessage(editMessageArea, error.message, 'error');
        }
    }

    if (editReservationForm) { // This implies we are on edit_reservation.html
        loadAdminParksDropdown().then(() => { // Load parks first, then reservation details
            if (currentReservationId) {
                fetchReservationDetails();
            }
        });

        if (adminParkNameSelect && adminParkNameOtherInput) {
            adminParkNameSelect.addEventListener('change', () => {
                if (adminParkNameSelect.value === 'other') {
                    adminParkNameOtherInput.style.display = 'inline-block';
                    adminParkNameOtherInput.focus();
                } else {
                    adminParkNameOtherInput.style.display = 'none';
                    adminParkNameOtherInput.value = '';
                }
            });
        }

        async function fetchReservationDetails() {
            try {
                const response = await fetch(`/api/reservations/${currentReservationId}`);
                if (!response.ok) {
                    if (response.status === 401) {
                         const errorData = await response.json();
                         if (errorData.redirect_url) window.location.href = errorData.redirect_url;
                         return;
                    }
                    throw new Error(`Failed to load reservation details: ${response.status}`);
                }
                const reservation = await response.json();

                document.getElementById('start_datetime').value = formatToDateTimeLocal(reservation.start_datetime);
                document.getElementById('end_datetime').value = formatToDateTimeLocal(reservation.end_datetime);
                document.querySelector(`input[name="is_exclusive"][value="${reservation.is_exclusive}"]`).checked = true;
                document.getElementById('purpose').value = reservation.purpose;
                document.getElementById('organization_name').value = reservation.organization_name;
                document.getElementById('grade').value = reservation.grade || '';
                document.getElementById('number_of_people').value = reservation.number_of_people;
                document.getElementById('contact_info').value = reservation.contact_info;
                document.getElementById('status').value = reservation.status;

                // Set park_name in the select or "other" input
                const parkName = reservation.park_name;
                let parkFoundInSelect = false;
                for (let i = 0; i < adminParkNameSelect.options.length; i++) {
                    if (adminParkNameSelect.options[i].value === parkName) {
                        adminParkNameSelect.value = parkName;
                        parkFoundInSelect = true;
                        break;
                    }
                }
                if (!parkFoundInSelect && parkName) {
                    adminParkNameSelect.value = 'other';
                    adminParkNameOtherInput.value = parkName;
                    adminParkNameOtherInput.style.display = 'inline-block';
                } else {
                    adminParkNameOtherInput.style.display = 'none';
                }

            } catch (error) {
                console.error('Error fetching reservation details:', error);
                showMessage(editMessageArea, `予約情報の読み込みに失敗しました: ${error.message}`, 'error');
            }
        }

        editReservationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearMessage(editMessageArea);

            const formData = new FormData(editReservationForm);
            const data = Object.fromEntries(formData.entries()); // reservation_id might be included here if it's a form field

            // Park name handling
            let finalParkName = '';
            if (adminParkNameSelect.value === 'other') {
                finalParkName = adminParkNameOtherInput.value.trim();
            } else {
                finalParkName = adminParkNameSelect.value;
            }
            if (!finalParkName) {
                showMessage(editMessageArea, '公園名を選択または入力してください。', 'error');
                adminParkNameSelect.focus();
                return;
            }
            data.park_name = finalParkName; // Ensure this is the key the API expects
            delete data.park_name_select; // Remove original select if it was in formData
            delete data.park_name_other;  // Remove other input if it was in formData


            data.is_exclusive = parseInt(data.is_exclusive, 10);
            data.number_of_people = parseInt(data.number_of_people, 10);
            if (!data.grade) data.grade = null;

            const method = currentReservationId ? 'PUT' : 'POST';
            const url = currentReservationId ? `/api/reservations/${currentReservationId}` : '/api/reservations';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                const result = await response.json();
                if (response.ok && result.success !== false) { // Check for explicit failure from API too
                    const successMessage = currentReservationId ? '予約を更新しました。' : (result.message || '予約を作成しました。');
                    showMessage(editMessageArea, successMessage , 'success');
                    if (!currentReservationId && result.id) {
                         alert('予約が正常に作成されました。ダッシュボードに戻ります。');
                         window.location.href = '/admin/dashboard';
                    } else {
                         setTimeout(() => { window.location.href = '/admin/dashboard'; }, 1500);
                    }
                } else {
                    showMessage(editMessageArea, result.error || result.message || '保存に失敗しました。', 'error');
                }
            } catch (error) {
                console.error('Error saving reservation:', error);
                showMessage(editMessageArea, '保存処理中にエラーが発生しました。', 'error');
            }
        });
    }
});
