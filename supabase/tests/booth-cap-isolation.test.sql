begin isolation level repeatable read;
select no_plan();

insert into auth.users(id,instance_id,aud,role,email) values
 ('0097eeee-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booth-repeatable-free@test.local'),
 ('0097eeee-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booth-repeatable-paid@test.local');
insert into qkit.vendors(id,plan) values
 ('0097eeee-0000-0000-0000-000000000001','free'),
 ('0097eeee-0000-0000-0000-000000000002','pro');
select throws_ok($$ insert into qkit.booths(vendor_id,name) values
 ('0097eeee-0000-0000-0000-000000000001','repeatable free') $$,
 '22023','free booth creation requires READ COMMITTED isolation',
 'fixed-snapshot isolation cannot bypass the free recount');
select lives_ok($$ insert into qkit.booths(vendor_id,name) values
 ('0097eeee-0000-0000-0000-000000000002','paid one'),
 ('0097eeee-0000-0000-0000-000000000002','paid two') $$,
 'paid creation remains available at stronger isolation');
update qkit.vendors set plan='free' where id='0097eeee-0000-0000-0000-000000000002';
select lives_ok($$ update qkit.booths set name='downgraded edit'
 where vendor_id='0097eeee-0000-0000-0000-000000000002' $$,
 'mere editing after downgrade does not invoke the isolation restriction');

select * from finish();
rollback;
