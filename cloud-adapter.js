(function exposeKitchenCloud(root) {
  let client = null;
  let currentProfile = null;
  let currentMenuId = null;
  let currentSelectionId = null;
  let realtimeChannel = null;
  let reloadTimer = null;

  function requireClient() {
    if (!client) throw new Error("云端尚未连接");
    return client;
  }

  function todayString() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  async function getProfile(userId) {
    const { data, error } = await requireClient()
      .from("profiles")
      .select("user_id, household_id, role, nickname")
      .eq("user_id", userId)
      .single();
    if (error) {
      throw new Error("登录成功，但没有找到家庭身份。请检查 profiles 表是否已绑定这个用户。");
    }
    return data;
  }

  async function initialize(onRemoteChange) {
    const config = root.KITCHEN_SUPABASE_CONFIG;
    if (!config?.url || !config?.publishableKey) {
      return { available: false, authenticated: false, reason: "缺少 Supabase 配置" };
    }
    if (!root.supabase?.createClient) {
      return { available: false, authenticated: false, reason: "Supabase 组件加载失败，请检查网络" };
    }
    client = root.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) return { available: true, authenticated: false };
    currentProfile = await getProfile(user.id);
    subscribe(onRemoteChange);
    return { available: true, authenticated: true, profile: currentProfile };
  }

  async function login(email, password, onRemoteChange) {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) {
      const code = String(error.code || "").toLowerCase();
      const message = String(error.message || "");
      if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
        throw new Error("Supabase 没有接受这组邮箱和密码。请确认该邮箱存在于 Authentication → Users，并使用创建该用户时填写的密码。");
      }
      if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
        throw new Error("这个邮箱账号还没有确认。请在 Authentication → Users 中打开该用户并完成确认，或重新创建时勾选 Auto Confirm User。");
      }
      if (/failed to fetch|network|load failed/i.test(message)) {
        throw new Error("网页无法连接 Supabase。请检查网络，并确认没有拦截 cdn.jsdelivr.net 或 supabase.co。");
      }
      if (/api key|apikey|jwt/i.test(message)) {
        throw new Error("Supabase 连接密钥无效，请重新检查 Project URL 和 Publishable key。");
      }
      throw new Error(`Supabase 登录失败：${message || code || "未知原因"}`);
    }
    currentProfile = await getProfile(data.user.id);
    subscribe(onRemoteChange);
    return currentProfile;
  }

  async function logout() {
    if (realtimeChannel) await requireClient().removeChannel(realtimeChannel);
    realtimeChannel = null;
    currentProfile = null;
    currentMenuId = null;
    currentSelectionId = null;
    await requireClient().auth.signOut();
  }

  function subscribe(onRemoteChange) {
    if (!onRemoteChange || realtimeChannel) return;
    const refresh = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => onRemoteChange(), 220);
    };
    realtimeChannel = requireClient()
      .channel(`our-kitchen-${currentProfile.household_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_menus" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "selections" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "selection_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_messages" }, refresh)
      .subscribe(status => {
        if (status === "SUBSCRIBED") refresh();
      });
  }

  async function fetchState() {
    if (!currentProfile) throw new Error("请先登录家庭账号");
    const [dishResponse, menuResponse, profileResponse] = await Promise.all([
      requireClient()
        .from("dishes")
        .select("id, name, category, description, image_url, emoji, created_at")
        .eq("household_id", currentProfile.household_id)
        .order("created_at", { ascending: true }),
      requireClient()
        .from("daily_menus")
        .select(`
          id, menu_date, status, status_updated_at,
          menu_items(dish_id)
        `)
        .eq("household_id", currentProfile.household_id)
        .order("menu_date", { ascending: false })
        .limit(30),
      requireClient()
        .from("profiles")
        .select("user_id, role, nickname")
        .eq("household_id", currentProfile.household_id)
    ]);
    if (dishResponse.error) throw dishResponse.error;
    if (menuResponse.error) throw menuResponse.error;
    if (profileResponse.error) throw profileResponse.error;

    const dishes = (dishResponse.data || []).map(dish => ({
      id: dish.id,
      name: dish.name,
      category: dish.category,
      description: dish.description,
      image: dish.image_url || "",
      emoji: dish.emoji || "🍽️"
    }));
    const menus = menuResponse.data || [];
    const menuIds = menus.map(menu => menu.id);
    let selections = [];
    if (menuIds.length) {
      const selectionResponse = await requireClient()
        .from("selections")
        .select("id, menu_id, note, submitted_at, selection_items(dish_id)")
        .in("menu_id", menuIds)
        .order("submitted_at", { ascending: false });
      if (selectionResponse.error) throw selectionResponse.error;
      selections = selectionResponse.data || [];
    }
    const selectionByMenu = new Map(selections.map(selection => [selection.menu_id, selection]));
    const familyProfiles = profileResponse.data || [];
    const profileByUser = new Map(familyProfiles.map(profile => [profile.user_id, profile]));
    let messages = [];
    let chatAvailable = true;
    const messageResponse = await requireClient()
      .from("household_messages")
      .select("id, sender_id, body, created_at")
      .eq("household_id", currentProfile.household_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (messageResponse.error) {
      if (
        ["42P01", "PGRST205"].includes(messageResponse.error.code)
        || /household_messages.*(?:does not exist|schema cache)/i.test(messageResponse.error.message || "")
      ) {
        chatAvailable = false;
      } else {
        throw messageResponse.error;
      }
    } else {
      messages = (messageResponse.data || []).reverse().map(message => ({
        id: message.id,
        senderId: message.sender_id,
        senderName: profileByUser.get(message.sender_id)?.nickname || "家里人",
        senderRole: profileByUser.get(message.sender_id)?.role || "diner",
        body: message.body,
        time: message.created_at
      }));
    }
    const todayMenu = menus.find(menu => menu.menu_date === todayString()) || null;
    const todaySelection = todayMenu ? selectionByMenu.get(todayMenu.id) || null : null;
    currentMenuId = todayMenu?.id || null;
    currentSelectionId = todaySelection?.id || null;

    const history = menus
      .filter(menu => selectionByMenu.has(menu.id))
      .map(menu => {
        const selection = selectionByMenu.get(menu.id);
        return {
          date: menu.menu_date,
          dishIds: (selection.selection_items || []).map(item => item.dish_id),
          note: selection.note || ""
        };
      });

    return {
      dishes,
      todayMenu: (todayMenu?.menu_items || []).map(item => item.dish_id),
      draftMenu: (todayMenu?.menu_items || []).map(item => item.dish_id),
      submission: todaySelection ? {
        dishIds: (todaySelection.selection_items || []).map(item => item.dish_id),
        note: todaySelection.note || "",
        time: todaySelection.submitted_at
      } : null,
      status: todaySelection && todayMenu?.status === "open" ? "submitted" : (todayMenu?.status || "open"),
      statusUpdatedAt: todayMenu?.status_updated_at || null,
      history,
      messages,
      chatAvailable
    };
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, encoded] = dataUrl.split(",");
    const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
    const bytes = atob(encoded);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index++) array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type: mime });
  }

  async function uploadDishImage(imageValue) {
    if (!imageValue || !imageValue.startsWith("data:image/")) return imageValue || null;
    const path = `${currentProfile.household_id}/${crypto.randomUUID()}.jpg`;
    const { error } = await requireClient()
      .storage
      .from("dish-images")
      .upload(path, dataUrlToBlob(imageValue), { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`照片上传失败：${error.message}`);
    return requireClient().storage.from("dish-images").getPublicUrl(path).data.publicUrl;
  }

  function storedDishImagePath(imageUrl) {
    if (!imageUrl) return null;
    try {
      const url = new URL(imageUrl);
      const projectUrl = new URL(root.KITCHEN_SUPABASE_CONFIG.url);
      const marker = "/storage/v1/object/public/dish-images/";
      if (url.origin !== projectUrl.origin || !url.pathname.startsWith(marker)) return null;
      const path = decodeURIComponent(url.pathname.slice(marker.length));
      return path.startsWith(`${currentProfile.household_id}/`) ? path : null;
    } catch {
      return null;
    }
  }

  async function deleteStoredDishImage(imageUrl) {
    const path = storedDishImagePath(imageUrl);
    if (!path) return;
    const { error } = await requireClient().storage.from("dish-images").remove([path]);
    if (error) throw new Error(`旧照片清理失败：${error.message}`);
  }

  async function fetchDishImage(id) {
    const { data, error } = await requireClient()
      .from("dishes")
      .select("image_url")
      .eq("id", id)
      .eq("household_id", currentProfile.household_id)
      .single();
    if (error) throw error;
    return data?.image_url || null;
  }

  async function createDish(values) {
    const imageUrl = await uploadDishImage(values.image);
    const { error } = await requireClient().from("dishes").insert({
      household_id: currentProfile.household_id,
      name: values.name,
      category: values.category,
      description: values.description,
      emoji: values.emoji,
      image_url: imageUrl
    });
    if (error) {
      await deleteStoredDishImage(imageUrl);
      throw error;
    }
  }

  async function updateDish(id, values) {
    const previousImageUrl = await fetchDishImage(id);
    const imageUrl = await uploadDishImage(values.image);
    const { error } = await requireClient()
      .from("dishes")
      .update({
        name: values.name,
        category: values.category,
        description: values.description,
        emoji: values.emoji,
        image_url: imageUrl || null
      })
      .eq("id", id)
      .eq("household_id", currentProfile.household_id);
    if (error) {
      if (imageUrl && imageUrl !== previousImageUrl) await deleteStoredDishImage(imageUrl);
      throw error;
    }
    if (previousImageUrl && previousImageUrl !== imageUrl) {
      await deleteStoredDishImage(previousImageUrl);
    }
  }

  async function deleteDish(id) {
    const previousImageUrl = await fetchDishImage(id);
    const { error } = await requireClient()
      .from("dishes")
      .delete()
      .eq("id", id)
      .eq("household_id", currentProfile.household_id);
    if (error) throw error;
    await deleteStoredDishImage(previousImageUrl);
  }

  async function publishMenu(dishIds) {
    const now = new Date().toISOString();
    const { data, error } = await requireClient()
      .from("daily_menus")
      .upsert({
        household_id: currentProfile.household_id,
        menu_date: todayString(),
        status: "open",
        status_updated_at: now
      }, { onConflict: "household_id,menu_date" })
      .select("id")
      .single();
    if (error) throw error;
    currentMenuId = data.id;
    const { error: deleteError } = await requireClient().from("menu_items").delete().eq("menu_id", data.id);
    if (deleteError) throw deleteError;
    if (dishIds.length) {
      const { error: insertError } = await requireClient()
        .from("menu_items")
        .insert(dishIds.map(dishId => ({ menu_id: data.id, dish_id: dishId })));
      if (insertError) throw insertError;
    }
  }

  async function submitChoice(dishIds, note) {
    if (!currentMenuId) throw new Error("今天还没有发布菜单");
    const submittedAt = new Date().toISOString();
    const { data: userData, error: userError } = await requireClient().auth.getUser();
    if (userError || !userData.user) throw userError || new Error("登录状态已失效，请重新登录");
    const { data, error } = await requireClient()
      .from("selections")
      .upsert({
        menu_id: currentMenuId,
        selected_by: userData.user.id,
        note,
        submitted_at: submittedAt
      }, { onConflict: "menu_id" })
      .select("id")
      .single();
    if (error) throw error;
    currentSelectionId = data.id;
    const { error: deleteError } = await requireClient()
      .from("selection_items")
      .delete()
      .eq("selection_id", currentSelectionId);
    if (deleteError) throw deleteError;
    const { error: insertError } = await requireClient()
      .from("selection_items")
      .insert(dishIds.map(dishId => ({ selection_id: currentSelectionId, dish_id: dishId })));
    if (insertError) throw insertError;
  }

  async function setStatus(status) {
    if (!currentMenuId) throw new Error("今天还没有发布菜单");
    const { error } = await requireClient()
      .from("daily_menus")
      .update({ status, status_updated_at: new Date().toISOString() })
      .eq("id", currentMenuId);
    if (error) throw error;
  }

  async function sendMessage(body) {
    const message = String(body || "").trim();
    if (!message) throw new Error("先写点想说的话吧");
    if (message.length > 500) throw new Error("一条消息最多 500 个字");
    const { error } = await requireClient().from("household_messages").insert({
      household_id: currentProfile.household_id,
      sender_id: currentProfile.user_id,
      body: message
    });
    if (error) throw error;
  }

  root.KitchenCloud = {
    initialize,
    login,
    logout,
    fetchState,
    createDish,
    updateDish,
    deleteDish,
    publishMenu,
    submitChoice,
    setStatus,
    sendMessage,
    get profile() { return currentProfile; },
    get ready() { return Boolean(client && currentProfile); }
  };
})(globalThis);
