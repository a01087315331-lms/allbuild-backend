const { supabase } = require('./utils/supabaseClient');
const { hashPassword } = require('./utils/auth');

async function run() {
    try {
        const password = '1234';
        console.log(`Hashing password: "${password}"...`);
        const hashedPassword = await hashPassword(password);
        console.log(`Hashed password: ${hashedPassword}`);

        console.log('Checking for existing user "allbuild"...');
        const { data: existing, error: selectError } = await supabase
            .from('member_accounts')
            .select('*')
            .eq('username', 'allbuild')
            .maybeSingle();

        if (selectError) {
            console.error('Error selecting user:', selectError);
            return;
        }

        if (existing) {
            console.log('User "allbuild" exists. Updating password...');
            const { error: updateError } = await supabase
                .from('member_accounts')
                .update({ password_hash: hashedPassword })
                .eq('id', existing.id);
            
            if (updateError) {
                console.error('Error updating password:', updateError);
            } else {
                console.log('Successfully updated password to "1234"!');
            }
        } else {
            console.log('User "allbuild" does not exist. Creating new user...');
            const { error: insertError } = await supabase
                .from('member_accounts')
                .insert([{
                    username: 'allbuild',
                    password_hash: hashedPassword
                }]);
            
            if (insertError) {
                console.error('Error inserting user:', insertError);
            } else {
                console.log('Successfully created user "allbuild" with password "1234"!');
            }
        }
    } catch (e) {
        console.error('System error:', e);
    }
}

run();
